import * as Task from "../task/index.js";
import { loadBotConfig } from "../config/load-bot-config.js";
import type { IssueLabeled } from "../canonical/events.js";
import type { WebhookRuntimeDeps } from "../scm/handler-deps.js";
import { scmProjectOptsFromRepo } from "./scm-project-opts.js";

/**
 * `issues.labeled` domain logic — only {@link IssueLabeled}, `ScmClient`, and config (docs §8.5).
 */
export async function onIssueLabeled(
    event: IssueLabeled,
    deps: WebhookRuntimeDeps,
): Promise<void> {
    const { scm, log } = deps;
    const repoFullName = event.repo.fullName;
    const label = event.label;
    const labeled =
        label?.name.startsWith("r2cn-") && label?.name != "r2cn-complete";
    if (!labeled) {
        log.info(
            {
                handlerDecision: "skip_not_r2cn_score_label",
                labelName: label?.name ?? "(none)",
                repoFullName,
                issueNumber: event.issue.number,
            },
            "onIssueLabeled: no r2cn-* score label on this event",
        );
        return;
    }

    const config = await loadBotConfig(scm, log, repoFullName);
    if (config == null) {
        log.error(
            { handlerDecision: "abort_config_null", repoFullName },
            "onIssueLabeled: loadBotConfig failed",
        );
        return;
    }

    const owner = event.repo.owner;
    const repoName = event.repo.name;
    const issueNumber = event.issue.number;
    const p = scmProjectOptsFromRepo(event.repo);

    const multi_label: boolean =
        event.labels.filter((l) => l.name.startsWith("r2cn-")).length > 1;
    if (multi_label) {
        log.info(
            {
                handlerDecision: "reply_multi_r2cn_labels",
                repoFullName,
                issueNumber,
                r2cnLabelCount: event.labels.filter((l) => l.name.startsWith("r2cn-")).length,
            },
            "onIssueLabeled: multiple r2cn-* labels → posting multiScore message",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: config.comment.task.multiScoreLabel,
            ...p,
        });
        return;
    }

    const repoCfg = config.approvedRepositories.find((r) => r.name === repoFullName);
    log.info(
        {
            repoFullName,
            matchedApprovedRepository: repoCfg != null,
        },
        "approved repository filter result",
    );
    if (!repoCfg) {
        log.info(
            {
                handlerDecision: "reply_repo_not_in_approved_list",
                repoFullName,
                issueNumber,
                approvedRepositoryCount: config.approvedRepositories.length,
            },
            "onIssueLabeled: repo not in r2cn.yaml approvedRepositories → noneProjectComment",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: config.comment.project.noneProjectComment,
            ...p,
        });
        return;
    }

    const creator = event.issueAuthor?.login ?? "";
    const maintainer = repoCfg.maintainers.find((m) => m.id === creator);
    if (!maintainer) {
        log.info(
            {
                handlerDecision: "reply_author_not_maintainer",
                repoFullName,
                issueNumber,
                creatorLogin: creator || "(empty)",
                maintainerIds: repoCfg.maintainers.map((m) => m.id),
            },
            "onIssueLabeled: issue author not in maintainer list → noneMaintainerComment",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: config.comment.project.noneMaintainerComment,
            ...p,
        });
        return;
    }

    const scoreStr = label?.name.split("-")[1];
    let score = 0;
    if (scoreStr === undefined) {
        log.info(
            {
                handlerDecision: "reply_score_suffix_missing",
                repoFullName,
                issueNumber,
                labelName: label?.name,
            },
            "onIssueLabeled: r2cn-* label has no numeric suffix → scoreUndefinedComment",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: config.comment.task.scoreUndefinedComment,
            ...p,
        });
        return;
    }
    score = parseInt(scoreStr, 10);

    if (score > maintainer.maxScore || score < 2) {
        log.info(
            {
                handlerDecision: "reply_score_out_of_range",
                repoFullName,
                issueNumber,
                score,
                maxScore: maintainer.maxScore,
            },
            "onIssueLabeled: score invalid vs maintainer.maxScore → scoreInvalidComment",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: config.comment.task.scoreInvalidComment,
            ...p,
        });
        return;
    }

    const taskLookup = await Task.getTaskLookup(event.issue.id, event.repo.provider);
    const task = taskLookup.task;
    if (task == null) {
        if (taskLookup.apiError) {
            log.warn(
                {
                    handlerDecision: "task_lookup_api_error_reply_api_unavailable",
                    repoFullName,
                    issueNumber,
                    issueInternalId: event.issue.id,
                    apiMessage: taskLookup.message,
                },
                "onIssueLabeled: task lookup API failed → apiUnavailable",
            );
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: config.comment.task.apiUnavailable,
                ...p,
            });
            return;
        }
        log.info(
            {
                handlerDecision: "task_branch_no_existing_task",
                repoFullName,
                issueNumber,
                issueInternalId: event.issue.id,
                score,
            },
            "onIssueLabeled: no existing task for issue; running checkTask / newTask",
        );
        const checkRes: Task.CheckTaskResults = await Task.checkTask(
            event.repo,
            config,
            maintainer,
            event.repo.provider,
        );
        if (checkRes.result) {
            const newTaskRes = await Task.newTask(
                {
                    repo: event.repo,
                    issue: event.issue,
                    mentor: { login: creator },
                    score,
                },
                event.repo.provider,
            );
            if (newTaskRes.ok) {
                log.info(
                    {
                        handlerDecision: "reply_new_task_success",
                        repoFullName,
                        issueNumber,
                    },
                    "onIssueLabeled: newTask succeeded → success comment",
                );
                await scm.createIssueComment({
                    owner,
                    repo: repoName,
                    issueNumber,
                    body: config.comment.task.success,
                    ...p,
                });
            } else {
                log.warn(
                    {
                        handlerDecision: "new_task_failed_no_comment",
                        repoFullName,
                        issueNumber,
                        apiError: newTaskRes.apiError,
                        apiMessage: newTaskRes.message,
                    },
                    "onIssueLabeled: checkTask passed but newTask returned false",
                );
                await scm.createIssueComment({
                    owner,
                    repo: repoName,
                    issueNumber,
                    body: newTaskRes.apiError
                        ? config.comment.task.apiUnavailable
                        : config.comment.command.invalidTaskState,
                    ...p,
                });
            }
        } else {
            log.info(
                {
                    handlerDecision: "reply_check_task_failed",
                    repoFullName,
                    issueNumber,
                },
                "onIssueLabeled: checkTask failed → posting check message",
            );
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: checkRes.apiError ? config.comment.task.apiUnavailable : checkRes.message,
                ...p,
            });
        }
    } else {
        if (task.task_status == Task.TaskStatus.Finished) {
            log.info(
                {
                    handlerDecision: "reply_task_finished_no_modify",
                    repoFullName,
                    issueNumber,
                    taskStatus: task.task_status,
                },
                "onIssueLabeled: task finished → notAllowedModify comment",
            );
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: config.comment.task.notAllowedModify,
                ...p,
            });
        } else {
            log.info(
                {
                    handlerDecision: "update_score_and_reply",
                    repoFullName,
                    issueNumber,
                    score,
                },
                "onIssueLabeled: updating task score and posting successUpdate",
            );
            const updateRes = await Task.updateTaskScore(event.issue, score, event.repo.provider);
            if (!updateRes.ok) {
                await scm.createIssueComment({
                    owner,
                    repo: repoName,
                    issueNumber,
                    body: updateRes.apiError
                        ? config.comment.task.apiUnavailable
                        : config.comment.command.invalidTaskState,
                    ...p,
                });
                return;
            }
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: `${config.comment.task.successUpdate.trim()}: ${score}`,
                ...p,
            });
        }
    }
}
