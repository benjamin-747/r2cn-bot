import * as Task from "../task/index.js";
import { loadCommentConfig } from "../config/load-comment-config.js";
import { loadMentorLimitsFromPortal } from "../config/load-mentor-limits.js";
import { loadOpenSourceInternshipConfigFromPortal } from "../config/load-open-source-internship-config.js";
import type { IssueLabeled } from "../canonical/events.js";
import type { WebhookRuntimeDeps } from "../scm/handler-deps.js";
import { scmProjectOptsFromRepo } from "./scm-project-opts.js";

const API_UNAVAILABLE_COMMENT_LOG_MARKER = "api_unavailable_comment_emit_v1";

function logApiUnavailableCommentEmit(
    deps: WebhookRuntimeDeps,
    event: IssueLabeled,
    source: string,
    apiMessage?: string,
): void {
    deps.log.warn(
        {
            marker: API_UNAVAILABLE_COMMENT_LOG_MARKER,
            source,
            provider: event.repo.provider,
            repoFullName: event.repo.fullName,
            issueNumber: event.issue.number,
            issueInternalId: event.issue.id,
            labelName: event.label?.name ?? "",
            apiMessage: apiMessage ?? "",
        },
        "emit apiUnavailable comment",
    );
}

/**
 * `issues.labeled` domain logic — only {@link IssueLabeled}, `ScmClient`, and config (docs §8.5).
 */
export async function onIssueLabeled(
    event: IssueLabeled,
    deps: WebhookRuntimeDeps,
): Promise<void> {
    const { scm, log } = deps;
    const repoFullName = event.repo.fullName;
    const internshipConfig = await loadOpenSourceInternshipConfigFromPortal(log);
    if (internshipConfig == null) {
        logApiUnavailableCommentEmit(deps, event, "portal_internship_config");
        const comment = await loadCommentConfig(log, repoFullName);
        if (comment != null) {
            await scm.createIssueComment({
                owner: event.repo.owner,
                repo: event.repo.name,
                issueNumber: event.issue.number,
                body: comment.system.apiUnavailable,
                ...scmProjectOptsFromRepo(event.repo),
            });
        }
        return;
    }
    const scorePrefix = `${internshipConfig.tagPrefix}-`;
    const completeLabel = `${internshipConfig.tagPrefix}-complete`;
    const label = event.label;
    const labeled =
        label?.name.startsWith(scorePrefix) && label?.name !== completeLabel;
    if (!labeled) {
        log.info(
            {
                handlerDecision: "skip_not_score_prefix_label",
                labelName: label?.name ?? "(none)",
                repoFullName,
                issueNumber: event.issue.number,
                tagPrefix: internshipConfig.tagPrefix,
            },
            "onIssueLabeled: no <tagPrefix>-* score label on this event",
        );
        return;
    }

    const comment = await loadCommentConfig(log, repoFullName);
    if (comment == null) {
        log.error(
            { handlerDecision: "abort_config_null", repoFullName },
            "onIssueLabeled: loadCommentConfig failed",
        );
        return;
    }
    const config = { comment, approvedRepositories: [] };

    const owner = event.repo.owner;
    const repoName = event.repo.name;
    const issueNumber = event.issue.number;
    const p = scmProjectOptsFromRepo(event.repo);

    const multi_label: boolean =
        event.labels.filter((l) => l.name.startsWith(scorePrefix) && l.name !== completeLabel).length > 1;
    if (multi_label) {
        log.info(
            {
                handlerDecision: "reply_multi_score_prefix_labels",
                repoFullName,
                issueNumber,
                scoreLabelCount: event.labels.filter((l) => l.name.startsWith(scorePrefix) && l.name !== completeLabel).length,
                tagPrefix: internshipConfig.tagPrefix,
            },
            "onIssueLabeled: multiple <tagPrefix>-* labels → posting multiScore message",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: comment.task.multiScoreLabel,
            ...p,
        });
        return;
    }

    const mentorLimits = await loadMentorLimitsFromPortal(log, {
        platform: event.repo.provider,
        owner,
        repo: repoName,
    });
    if (!mentorLimits.ok && mentorLimits.notFound) {
        log.info(
            {
                handlerDecision: "reply_repo_not_in_approved_list",
                repoFullName,
                issueNumber,
            },
            "onIssueLabeled: repo not in portal mentor limits → noneProjectComment",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: comment.project.noneProjectComment,
            ...p,
        });
        return;
    }
    if (!mentorLimits.ok) {
        logApiUnavailableCommentEmit(deps, event, "portal_mentor_limits");
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: comment.system.apiUnavailable,
            ...p,
        });
        return;
    }

    const creator = event.issueAuthor?.login ?? "";
    const maintainer = mentorLimits.maintainers.find((m) => m.id === creator);
    if (!maintainer) {
        log.info(
            {
                handlerDecision: "reply_author_not_maintainer",
                repoFullName,
                issueNumber,
                creatorLogin: creator || "(empty)",
                maintainerIds: mentorLimits.maintainers.map((m) => m.id),
            },
            "onIssueLabeled: issue author not in maintainer list → noneMaintainerComment",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: comment.project.noneMaintainerComment,
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
                tagPrefix: internshipConfig.tagPrefix,
            },
            "onIssueLabeled: <tagPrefix>-* label has no numeric suffix → scoreUndefinedComment",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: comment.task.scoreUndefinedComment,
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
            body: comment.task.scoreInvalidComment,
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
            logApiUnavailableCommentEmit(deps, event, "task_lookup", taskLookup.message);
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: comment.system.apiUnavailable,
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
                    body: comment.task.success,
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
                if (newTaskRes.apiError) {
                    logApiUnavailableCommentEmit(deps, event, "new_task", newTaskRes.message);
                }
                await scm.createIssueComment({
                    owner,
                    repo: repoName,
                    issueNumber,
                    body: newTaskRes.apiError
                        ? comment.system.apiUnavailable
                        : comment.command.invalidTaskState,
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
            if (checkRes.apiError) {
                logApiUnavailableCommentEmit(deps, event, "check_task", checkRes.message);
            }
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: checkRes.apiError ? comment.system.apiUnavailable : checkRes.message,
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
                body: comment.task.notAllowedModify,
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
                if (updateRes.apiError) {
                    logApiUnavailableCommentEmit(deps, event, "update_task_score", updateRes.message);
                }
                await scm.createIssueComment({
                    owner,
                    repo: repoName,
                    issueNumber,
                    body: updateRes.apiError
                        ? comment.system.apiUnavailable
                        : comment.command.invalidTaskState,
                    ...p,
                });
                return;
            }
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: `${comment.task.successUpdate.trim()}: ${score}`,
                ...p,
            });
        }
    }
}
