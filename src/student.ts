
import { User } from "@octokit/webhooks-types";
import { CommandRequest, Config, postData } from "./common.js";
import { Task, TaskStatus } from "./task.js";


export async function handle_stu_cmd(student: User, command: string, config: Config, task: Task) {
    var command_res = {
        result: false,
        message: "",
    };

    const setResponse = (message: string, result: boolean = false) => {
        command_res.message = message;
        command_res.result = result;
        return command_res;
    };

    const isStudentAuthorized = (task: Task, student: User) => {
        return task.student_github_login === student.login;
    };

    switch (command) {
        case "/request-assign":
            if (task.task_status !== TaskStatus.Open) {
                return setResponse(config.command.invalidTaskState);
            }

            if (!await verifyStudentIdentity(student.login)) {
                return setResponse(config.requestAssign.waitingInfoReview);
            }

            if (task.student_github_login === student.login) {
                return setResponse(config.requestAssign.alreadyClaim);
            }

            if (!await verifyStudentTask(student.login)) {
                return setResponse(config.requestAssign.existTask);
            }

            if (await requestAssign({
                github_issue_id: task.github_issue_id,
                login: student.login
            })) {
                return setResponse(config.requestAssign.success, true);
            } else {
                return setResponse("API ERROR");
            }
        case "/request-complete":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.command.invalidTaskState);
            }

            if (!isStudentAuthorized(task, student)) {
                return setResponse(config.command.noPermission);
            }

            await requestComplete({
                github_issue_id: task.github_issue_id,
                login: student.login
            })

            // TODO: Add logic to check related PRs
            return setResponse(config.requestComplete.success, true);

        case "/request-release":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.command.invalidTaskState);
            }

            if (!isStudentAuthorized(task, student)) {
                return setResponse(config.command.noPermission);
            }

            await releaseTask({
                github_issue_id: task.github_issue_id,
                login: student.login
            })
            return setResponse(config.requestComplete.success, true);

        default:
            return setResponse("Unsupported command");
    }
}


interface UserReq {
    login: string
}

async function verifyStudentIdentity(login: string) {
    const apiUrl = `${process.env.API_ENDPOINT}/student/validate`;
    const res = await postData<boolean, UserReq>(apiUrl, {
        "login": login
    }).then((res) => {
        return res.data
    });
    return res
}

async function verifyStudentTask(login: string) {
    const apiUrl = `${process.env.API_ENDPOINT}/student/task`;
    const res = await postData<Task, UserReq>(apiUrl, {
        "login": login
    }).then((res) => {
        return res.data
    });
    return res === null
}



async function requestAssign(req: CommandRequest) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/request-assign`;
    const res = await postData<boolean, CommandRequest>(apiUrl, req).then((res) => {
        return res.data
    });
    return res
}

export async function releaseTask(req: CommandRequest) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/release`;
    const res = await postData<boolean, CommandRequest>(apiUrl, req).then((res) => {
        return res.data
    });
    return res
}

async function requestComplete(req: CommandRequest) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/request-complete`;
    const res = await postData<boolean, CommandRequest>(apiUrl, req).then((res) => {
        return res.data
    });
    return res
}