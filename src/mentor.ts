import { User } from "@octokit/webhooks-types";
import { CommandRequest, Config, postData } from "./common.js";
import { Task, TaskStatus } from "./task.js";
import { releaseTask } from "./student.js";


export async function handle_mentor_cmd(student: User, command: string, config: Config, task: Task) {
    var command_res = {
        result: false,
        message: "",
    };

    const setResponse = (message: string, result: boolean = false) => {
        command_res.message = message;
        command_res.result = result;
        return command_res;
    };

    const isMentorAuthorized = (task: Task, student: User) => {
        return task.student_github_login === student.login;
    };

    if (!isMentorAuthorized(task, student)) {
        return setResponse(config.command.noPermission);
    }
    
    switch (command) {
        
        case "/intern-disapprove":
            if (task.task_status !== TaskStatus.RequestAssign) {
                return setResponse(config.command.invalidTaskState);
            }

            await releaseTask({
                github_issue_id: task.github_issue_id,
                login: student.login
            });
            return setResponse(config.internDisapprove.success, true);

        case "/intern-approve":
            if (task.task_status !== TaskStatus.RequestAssign) {
                return setResponse(config.command.invalidTaskState);
            }
            await internApprove({
                github_issue_id: task.github_issue_id,
                login: student.login
            });
            return setResponse(config.internApprove.success, true);

        case "/intern-fail":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.command.invalidTaskState);
            }
            await releaseTask({
                github_issue_id: task.github_issue_id,
                login: student.login
            });
            return setResponse(config.internFail.success, true);
        case "/intern-done":
            if (task.task_status !== TaskStatus.RequestFinish) {
                return setResponse(config.command.invalidTaskState);
            }
            await internDone({
                github_issue_id: task.github_issue_id,
                login: student.login
            });
            return setResponse(config.internDone.success, true);

        default:
            return setResponse("Unsupported command");
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