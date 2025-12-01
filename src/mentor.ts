import { Issue, User } from "@octokit/webhooks-types";
import { CommandRequest, Config, getClaimedLabelName, postData } from "./common.js";
import { Task, TaskStatus } from "./task.js";
import { releaseTask } from "./student.js";
import { Context } from "probot";

export interface Payload {
    user: User,
    command: string,
    issue: Issue,
    task: Task
}

export async function handle_mentor_cmd(context: Context, config: Config, payload: Payload) {
    var command_res = {
        result: false,
        message: "",
    };
    const { user, command, task } = payload;
    const setResponse = (message: string, result: boolean = false) => {
        command_res.message = message;
        command_res.result = result;
        return command_res;
    };

    const isMentorAuthorized = (task: Task, mentor: User) => {
        return task.mentor_github_login === mentor.login;
    };

    if (!isMentorAuthorized(task, user)) {
        return setResponse(config.comment.command.noPermission);
    }

    const req = {
        github_issue_id: task.github_issue_id,
    };
    switch (command) {
        case "/intern-disapprove":
            if (task.task_status !== TaskStatus.RequestAssign) {
                return setResponse(config.comment.command.invalidTaskState);
            }
            await releaseTask(req, context, payload);
            return setResponse(config.comment.internDisapprove.success, true);

        case "/intern-approve":
            if (task.task_status !== TaskStatus.RequestAssign) {
                return setResponse(config.comment.command.invalidTaskState);
            }
            await internApprove(req);
            const claimedLabel = getClaimedLabelName(task.owner, task.repo);
            await context.octokit.issues.addLabels({
                owner: task.owner,
                repo: task.repo,
                issue_number: task.github_issue_number,
                labels: [claimedLabel],
            });
            if (task.student_github_login) {
                await context.octokit.issues.addAssignees({
                    owner: task.owner,
                    repo: task.repo,
                    issue_number: task.github_issue_number,
                    assignees: [task.student_github_login],
                });
            }
            return setResponse(config.comment.internApprove.success, true);

        case "/intern-fail":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState);
            }
            if (task.student_github_login) { 
                await context.octokit.issues.removeAssignees({
                    owner: task.owner,
                    repo: task.repo,
                    issue_number: task.github_issue_number,
                    assignees: [task.student_github_login],
                });
            }
            await releaseTask(req, context, payload);

            return setResponse(config.comment.internFail.success, true);
        case "/intern-done":
            if (task.task_status !== TaskStatus.RequestFinish) {
                return setResponse(config.comment.command.invalidTaskState);
            }
            await context.octokit.issues.update({
                owner: task.owner,
                repo: task.repo,
                issue_number: task.github_issue_number,
                state: "closed",
            });
            await context.octokit.issues.addLabels({
                owner: task.owner,
                repo: task.repo,
                issue_number: task.github_issue_number,
                labels: ["r2cn-complete"],
            });
            await internDone(req);
            return setResponse(config.comment.internDone.success, true);
        case "/intern-close":
            await context.octokit.issues.removeAllLabels({
                owner: task.owner,
                repo: task.repo,
                issue_number: task.github_issue_number,
            });
            await internClose(req);
            return setResponse(config.comment.internClose.success, true);
        default:
            return setResponse(config.comment.command.unsupportMentorCommand);
    }
}


async function internApprove(req: CommandRequest) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-approve`;
    const res = await postData<boolean, CommandRequest>(apiUrl, req).then((res) => {
        return res.data
    });
    return res
}

async function internDone(req: CommandRequest) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-done`;
    const res = await postData<boolean, CommandRequest>(apiUrl, req).then((res) => {
        return res.data
    });
    return res
}

async function internClose(req: CommandRequest) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/intern-close`;
    const res = await postData<boolean, CommandRequest>(apiUrl, req).then((res) => {
        return res.data
    });
    return res
}