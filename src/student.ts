
import { User } from "@octokit/webhooks-types";
import { CommandRequest, Config, postData } from "./common.js";
import { Task, TaskStatus } from "./task.js";
import { Context } from "probot";


interface Payload {
    student: User,
    command: string,
    task: Task
}

export async function handle_stu_cmd(context: Context, config: Config, payload: Payload) {
    var command_res = {
        result: false,
        message: "",
    };
    const { student, command, task } = payload;

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
                return setResponse(config.comment.command.invalidTaskState);
            }

            if (!await verifyStudentIdentity(student.login)) {
                return setResponse(config.comment.requestAssign.waitingInfoReview);
            }

            if (task.student_github_login === student.login) {
                return setResponse(config.comment.requestAssign.alreadyClaim);
            }

            if (!await verifyStudentTask(student.login)) {
                return setResponse(config.comment.requestAssign.existTask);
            }

            if (await requestAssign({
                github_issue_id: task.github_issue_id,
                login: student.login,
                github_id: student.id
            })) {
                return setResponse(config.comment.requestAssign.success, true);
            } else {
                return setResponse("API ERROR");
            }
        case "/request-complete":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState);
            }

            if (!isStudentAuthorized(task, student)) {
                return setResponse(config.comment.command.noPermission);
            }

            //check related PRs
            // const res = await context.octokit.issues.get({
            //     owner: task.owner,
            //     repo: task.repo,
            //     issue_number: task.github_issue_number
            // });

            // if (res.data.pull_request == undefined) {
            //     return setResponse(config.requestComplete.noRelatedPR);
            // }
            await requestComplete({
                github_issue_id: task.github_issue_id,
                login: student.login,
                github_id: student.id
            })
            return setResponse(config.comment.requestComplete.success, true);

        case "/request-release":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState);
            }

            if (!isStudentAuthorized(task, student)) {
                return setResponse(config.comment.command.noPermission);
            }

            await releaseTask({
                github_issue_id: task.github_issue_id,
                login: student.login,
                github_id: student.id
            })
            return setResponse(config.comment.requestRelease.success, true);

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