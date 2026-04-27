import * as Task from "../task/index.js";
import { loadCommentConfig } from "../config/load-comment-config.js";
import type { IssueCommentCreated } from "../canonical/events.js";
import type { WebhookRuntimeDeps } from "../scm/handler-deps.js";
import * as Student from "../student/index.js";
import { handle_mentor_cmd } from "../mentor/index.js";
import { scmProjectOptsFromRepo } from "./scm-project-opts.js";

const API_UNAVAILABLE_COMMENT_LOG_MARKER = "api_unavailable_comment_emit_v1";

function logApiUnavailableCommentEmit(
    deps: WebhookRuntimeDeps,
    event: IssueCommentCreated,
    command: string,
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
            actorLogin: event.actor.login,
            commandPreview: command.slice(0, 80),
            apiMessage: apiMessage ?? "",
        },
        "emit apiUnavailable comment",
    );
}

/**
 * `issue_comment.created` domain logic (docs §8.5).
 */
export async function onIssueCommentCreated(
    event: IssueCommentCreated,
    deps: WebhookRuntimeDeps,
): Promise<void> {
    const { scm, log } = deps;
    const command = event.body.trim();

    if (event.isBot) {
        log.info(
            {
                handlerDecision: "skip_bot_comment",
                repoFullName: event.repo.fullName,
                issueNumber: event.issue.number,
                actorLogin: event.actor.login,
            },
            "onIssueCommentCreated: bot comment ignored",
        );
        return;
    }

    // Ignore non-command comments early to avoid noisy logs and extra API/config work.
    if (!command.startsWith("/")) {
        return;
    }

    const comment = await loadCommentConfig(log, event.repo.fullName);
    if (comment == null) {
        log.error(
            { handlerDecision: "abort_config_null", repoFullName: event.repo.fullName },
            "onIssueCommentCreated: loadCommentConfig failed",
        );
        return;
    }

    const owner = event.repo.owner;
    const repoName = event.repo.name;
    const issueNumber = event.issue.number;
    const p = scmProjectOptsFromRepo(event.repo);

    const taskLookup = await Task.getTaskLookup(event.issue.id, event.repo.provider);
    const task = taskLookup.task;
    if (task == null) {
        if (taskLookup.apiError) {
            log.warn(
                {
                    handlerDecision: "task_lookup_api_error",
                    repoFullName: event.repo.fullName,
                    issueNumber: event.issue.number,
                    issueInternalId: event.issue.id,
                    apiMessage: taskLookup.message,
                    commandPreview: command.slice(0, 80),
                },
                "onIssueCommentCreated: task lookup API failed; posting apiUnavailable",
            );
            logApiUnavailableCommentEmit(deps, event, command, "task_lookup", taskLookup.message);
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
                handlerDecision: "task_not_found_will_still_evaluate_command",
                repoFullName: event.repo.fullName,
                issueNumber: event.issue.number,
                issueInternalId: event.issue.id,
                commandPreview: command.slice(0, 80),
            },
            "onIssueCommentCreated: no task row for issue; posting taskNotFound then handling command",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: comment.task.taskNotFound,
            ...p,
        });
        if (command.startsWith("/request")) {
            log.info(
                {
                    handlerDecision: "task_not_found_return_after_comment",
                    repoFullName: event.repo.fullName,
                    issueNumber: event.issue.number,
                    commandPreview: command.slice(0, 80),
                },
                "onIssueCommentCreated: task missing for /request*; return after taskNotFound comment",
            );
            return;
        }
    }

    if (command.startsWith("/request")) {
        log.info(
            {
                handlerDecision: "command_branch_student",
                repoFullName: event.repo.fullName,
                issueNumber: event.issue.number,
                hasTask: task != null,
            },
            "onIssueCommentCreated: /request* → handle_stu_cmd",
        );
        const res = await Student.handle_stu_cmd(scm, { comment, approvedRepositories: [] }, {
            actor: event.actor,
            command,
            issue: event.issue,
            issueLabels: event.issueLabels,
            task,
            scmProvider: event.repo.provider,
        });
        if (res.apiError) {
            logApiUnavailableCommentEmit(deps, event, command, "student_command", res.message);
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: comment.system.apiUnavailable,
                ...p,
            });
            return;
        }
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: res.message,
            ...p,
        });
    } else if (command.startsWith("/intern")) {
        log.info(
            {
                handlerDecision: "command_branch_mentor",
                repoFullName: event.repo.fullName,
                issueNumber: event.issue.number,
                hasTask: task != null,
            },
            "onIssueCommentCreated: /intern* → handle_mentor_cmd",
        );
        const res = await handle_mentor_cmd(scm, { comment, approvedRepositories: [] }, {
            actor: event.actor,
            command,
            issue: event.issue,
            issueLabels: event.issueLabels,
            task,
            scmProvider: event.repo.provider,
        });
        if (res.apiError) {
            logApiUnavailableCommentEmit(deps, event, command, "mentor_command", res.message);
            await scm.createIssueComment({
                owner,
                repo: repoName,
                issueNumber,
                body: comment.system.apiUnavailable,
                ...p,
            });
            return;
        }
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: res.message,
            ...p,
        });
    } else {
        log.info(
            {
                handlerDecision: "command_unknown_slash",
                repoFullName: event.repo.fullName,
                issueNumber: event.issue.number,
                commandPreview: command.slice(0, 80),
            },
            "onIssueCommentCreated: unknown slash command → 错误的命令",
        );
        await scm.createIssueComment({
            owner,
            repo: repoName,
            issueNumber,
            body: "错误的命令",
            ...p,
        });
    }
}
