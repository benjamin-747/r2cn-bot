import * as Task from "../task/index.js";
import { loadBotConfig } from "../config/load-bot-config.js";
import type { IssueCommentCreated } from "../canonical/events.js";
import type { WebhookRuntimeDeps } from "../scm/handler-deps.js";
import * as Student from "../student/index.js";
import { handle_mentor_cmd } from "../mentor/index.js";
import { scmProjectOptsFromRepo } from "./scm-project-opts.js";

/**
 * `issue_comment.created` domain logic (docs §8.5).
 */
export async function onIssueCommentCreated(
    event: IssueCommentCreated,
    deps: WebhookRuntimeDeps,
): Promise<void> {
    const { scm, log } = deps;

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

    const config = await loadBotConfig(scm, log, event.repo.fullName);
    if (config == null) {
        log.error(
            { handlerDecision: "abort_config_null", repoFullName: event.repo.fullName },
            "onIssueCommentCreated: loadBotConfig failed",
        );
        return;
    }

    const owner = event.repo.owner;
    const repoName = event.repo.name;
    const issueNumber = event.issue.number;
    const p = scmProjectOptsFromRepo(event.repo);

    const command = event.body.trim();
    if (!command.startsWith("/")) {
        return;
    }

    const task = await Task.getTask(event.issue.id, event.repo.provider);
    if (task == null) {
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
            body: config.comment.task.taskNotFound,
            ...p,
        });
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
        const res = await Student.handle_stu_cmd(scm, config, {
            actor: event.actor,
            command,
            issue: event.issue,
            issueLabels: event.issueLabels,
            task,
            scmProvider: event.repo.provider,
        });
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
        const res = await handle_mentor_cmd(scm, config, {
            actor: event.actor,
            command,
            issue: event.issue,
            issueLabels: event.issueLabels,
            task,
            scmProvider: event.repo.provider,
        });
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
