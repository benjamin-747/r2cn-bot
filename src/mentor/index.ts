import { CommandRequest, Config, getClaimedLabelName, isBackendApiError, postData } from "../config/index.js";
import type { ScmProvider } from "../canonical/scm-provider.js";
import type { Actor, IssueRef, LabelRef } from "../canonical/refs.js";
import { Task, TaskStatus } from "../task/index.js";
import { releaseTask } from "../student/index.js";
import type { ScmClient } from "../scm/types.js";
import { scmProjectOptsFromTask } from "../handlers/scm-project-opts.js";
import { mergeBackendWithTask } from "../api/scm-backend-payload.js";
import type { TaskApiResult } from "../task/index.js";

export type MentorCommandBusinessCode =
    | "invalid_task_state"
    | "no_permission"
    | "intern_disapprove_success"
    | "intern_approve_success"
    | "intern_fail_success"
    | "intern_done_success"
    | "intern_close_success"
    | "intern_approve_failed"
    | "intern_done_failed"
    | "intern_close_failed"
    | "unsupported_mentor_command"
    | "api_error";

export interface MentorCommandResult {
    result: boolean;
    message: string;
    apiError: boolean;
    businessCode: MentorCommandBusinessCode;
}

export interface Payload {
    actor: Actor,
    command: string,
    issue: IssueRef,
    issueLabels: LabelRef[],
    task: Task | null,
    scmProvider: ScmProvider,
}

export async function handle_mentor_cmd(scm: ScmClient, config: Config, payload: Payload) {
    var command_res: MentorCommandResult = {
        result: false,
        message: "",
        apiError: false,
        businessCode: "invalid_task_state",
    };
    const { actor, command, task, scmProvider } = payload;
    if (task == null) {
        return {
            result: false,
            message: config.comment.command.invalidTaskState,
            apiError: false,
            businessCode: "invalid_task_state",
        };
    }
    const setResponse = (
        message: string,
        businessCode: MentorCommandBusinessCode,
        result: boolean = false,
        apiError: boolean = false,
    ) => {
        command_res.message = message;
        command_res.result = result;
        command_res.businessCode = businessCode;
        command_res.apiError = apiError;
        return command_res;
    };

    const isMentorAuthorized = (task: Task, mentor: Actor) => {
        return task.mentor_login === mentor.login;
    };

    if (!isMentorAuthorized(task, actor)) {
        return setResponse(config.comment.command.noPermission, "no_permission");
    }

    const req = {
        issue_id: task.issue_id,
    };
    const tp = scmProjectOptsFromTask(task);
    switch (command) {
        case "/intern-disapprove":
            if (task.task_status !== TaskStatus.RequestAssign) {
                return setResponse(config.comment.command.invalidTaskState, "invalid_task_state");
            }
            await releaseTask(req, scm, payload);
            return setResponse(config.comment.internDisapprove.success, "intern_disapprove_success", true);

        case "/intern-approve":
            if (task.task_status !== TaskStatus.RequestAssign) {
                return setResponse(config.comment.command.invalidTaskState, "invalid_task_state");
            }
            const approveRes = await internApprove(req, task, scmProvider);
            if (approveRes.apiError) {
                return setResponse(config.comment.task.apiUnavailable, "api_error", false, true);
            }
            if (!approveRes.ok) {
                return setResponse(config.comment.command.invalidTaskState, "intern_approve_failed");
            }
            const claimedLabel = getClaimedLabelName(task.owner, task.repo);
            await scm.addLabels({
                owner: task.owner,
                repo: task.repo,
                issueNumber: task.issue_number,
                labels: [claimedLabel],
                ...tp,
            });
            if (task.student_login) {
                await scm.addAssignees({
                    owner: task.owner,
                    repo: task.repo,
                    issueNumber: task.issue_number,
                    assignees: [task.student_login],
                    ...tp,
                });
            }
            return setResponse(config.comment.internApprove.success, "intern_approve_success", true);

        case "/intern-fail":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState, "invalid_task_state");
            }
            if (task.student_login) {
                await scm.removeAssignees({
                    owner: task.owner,
                    repo: task.repo,
                    issueNumber: task.issue_number,
                    assignees: [task.student_login],
                    ...tp,
                });
            }
            await releaseTask(req, scm, payload);

            return setResponse(config.comment.internFail.success, "intern_fail_success", true);
        case "/intern-done":
            if (task.task_status !== TaskStatus.RequestFinish) {
                return setResponse(config.comment.command.invalidTaskState, "invalid_task_state");
            }
            await scm.updateIssue({
                owner: task.owner,
                repo: task.repo,
                issueNumber: task.issue_number,
                state: "closed",
                ...tp,
            });
            await scm.addLabels({
                owner: task.owner,
                repo: task.repo,
                issueNumber: task.issue_number,
                labels: ["r2cn-complete"],
                ...tp,
            });
            const doneRes = await internDone(req, task, scmProvider);
            if (doneRes.apiError) {
                return setResponse(config.comment.task.apiUnavailable, "api_error", false, true);
            }
            if (!doneRes.ok) {
                return setResponse(config.comment.command.invalidTaskState, "intern_done_failed");
            }
            return setResponse(config.comment.internDone.success, "intern_done_success", true);
        case "/intern-close":
            await scm.removeAllLabels({
                owner: task.owner,
                repo: task.repo,
                issueNumber: task.issue_number,
                ...tp,
            });
            const closeRes = await internClose(req, task, scmProvider);
            if (closeRes.apiError) {
                return setResponse(config.comment.task.apiUnavailable, "api_error", false, true);
            }
            if (!closeRes.ok) {
                return setResponse(config.comment.command.invalidTaskState, "intern_close_failed");
            }
            return setResponse(config.comment.internClose.success, "intern_close_success", true);
        default:
            return setResponse(config.comment.command.unsupportMentorCommand, "unsupported_mentor_command");
    }
}


async function internApprove(req: CommandRequest, task: Task, scmProvider: ScmProvider) {
    const body = mergeBackendWithTask(req, scmProvider, task);
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-approve`;
    const apiRes = await postData<boolean, typeof body>(apiUrl, body);
    return {
        ok: apiRes.data === true,
        apiError: isBackendApiError(apiRes),
        message: apiRes.message,
    } as TaskApiResult;
}

async function internDone(req: CommandRequest, task: Task, scmProvider: ScmProvider) {
    const body = mergeBackendWithTask(req, scmProvider, task);
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-done`;
    const apiRes = await postData<boolean, typeof body>(apiUrl, body);
    return {
        ok: apiRes.data === true,
        apiError: isBackendApiError(apiRes),
        message: apiRes.message,
    } as TaskApiResult;
}

async function internClose(req: CommandRequest, task: Task, scmProvider: ScmProvider) {
    const body = mergeBackendWithTask(req, scmProvider, task);
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-close`;
    const apiRes = await postData<boolean, typeof body>(apiUrl, body);
    return {
        ok: apiRes.data === true,
        apiError: isBackendApiError(apiRes),
        message: apiRes.message,
    } as TaskApiResult;
}
