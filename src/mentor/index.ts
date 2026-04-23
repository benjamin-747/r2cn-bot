import { CommandRequest, Config, getClaimedLabelName, postData } from "../config/index.js";
import type { ScmProvider } from "../canonical/scm-provider.js";
import type { Actor, IssueRef, LabelRef } from "../canonical/refs.js";
import { Task, TaskStatus } from "../task/index.js";
import { releaseTask } from "../student/index.js";
import type { ScmClient } from "../scm/types.js";
import { scmProjectOptsFromTask } from "../handlers/scm-project-opts.js";
import { mergeBackendWithTask } from "../api/scm-backend-payload.js";

export interface Payload {
    actor: Actor,
    command: string,
    issue: IssueRef,
    issueLabels: LabelRef[],
    task: Task | null,
    scmProvider: ScmProvider,
}

export async function handle_mentor_cmd(scm: ScmClient, config: Config, payload: Payload) {
    var command_res = {
        result: false,
        message: "",
    };
    const { actor, command, task, scmProvider } = payload;
    if (task == null) {
        return {
            result: false,
            message: config.comment.command.invalidTaskState,
        };
    }
    const setResponse = (message: string, result: boolean = false) => {
        command_res.message = message;
        command_res.result = result;
        return command_res;
    };

    const isMentorAuthorized = (task: Task, mentor: Actor) => {
        return task.mentor_login === mentor.login;
    };

    if (!isMentorAuthorized(task, actor)) {
        return setResponse(config.comment.command.noPermission);
    }

    const req = {
        issue_id: task.issue_id,
    };
    const tp = scmProjectOptsFromTask(task);
    switch (command) {
        case "/intern-disapprove":
            if (task.task_status !== TaskStatus.RequestAssign) {
                return setResponse(config.comment.command.invalidTaskState);
            }
            await releaseTask(req, scm, payload);
            return setResponse(config.comment.internDisapprove.success, true);

        case "/intern-approve":
            if (task.task_status !== TaskStatus.RequestAssign) {
                return setResponse(config.comment.command.invalidTaskState);
            }
            await internApprove(req, task, scmProvider);
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
            return setResponse(config.comment.internApprove.success, true);

        case "/intern-fail":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState);
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

            return setResponse(config.comment.internFail.success, true);
        case "/intern-done":
            if (task.task_status !== TaskStatus.RequestFinish) {
                return setResponse(config.comment.command.invalidTaskState);
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
            await internDone(req, task, scmProvider);
            return setResponse(config.comment.internDone.success, true);
        case "/intern-close":
            await scm.removeAllLabels({
                owner: task.owner,
                repo: task.repo,
                issueNumber: task.issue_number,
                ...tp,
            });
            await internClose(req, task, scmProvider);
            return setResponse(config.comment.internClose.success, true);
        default:
            return setResponse(config.comment.command.unsupportMentorCommand);
    }
}


async function internApprove(req: CommandRequest, task: Task, scmProvider: ScmProvider) {
    const body = mergeBackendWithTask(req, scmProvider, task);
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-approve`;
    const res = await postData<boolean, typeof body>(apiUrl, body).then((res) => {
        return res.data
    });
    return res
}

async function internDone(req: CommandRequest, task: Task, scmProvider: ScmProvider) {
    const body = mergeBackendWithTask(req, scmProvider, task);
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-done`;
    const res = await postData<boolean, typeof body>(apiUrl, body).then((res) => {
        return res.data
    });
    return res
}

async function internClose(req: CommandRequest, task: Task, scmProvider: ScmProvider) {
    const body = mergeBackendWithTask(req, scmProvider, task);
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-close`;
    const res = await postData<boolean, typeof body>(apiUrl, body).then((res) => {
        return res.data
    });
    return res
}
