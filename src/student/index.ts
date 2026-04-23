
import { CommandRequest, Config, getClaimedLabelName, postData } from "../config/index.js";
import type { Actor } from "../canonical/refs.js";
import { Task, TaskStatus } from "../task/index.js";
import type { Payload } from "../mentor/index.js";
import type { ScmClient } from "../scm/types.js";
import { scmProjectOptsFromTask } from "../handlers/scm-project-opts.js";
import {
    mergeBackendProviderOnly,
    mergeBackendWithTask,
    type ScmBackendRequestFields,
} from "../api/scm-backend-payload.js";

export async function handle_stu_cmd(scm: ScmClient, config: Config, payload: Payload) {
    var command_res = {
        result: false,
        message: "",
    };
    const { actor, command, task, scmProvider } = payload;

    const setResponse = (message: string, result: boolean = false) => {
        command_res.message = message;
        command_res.result = result;
        return command_res;
    };

    if (task == null) {
        return setResponse(config.comment.command.invalidTaskState);
    }

    const isStudentAuthorized = (task: Task, student: Actor) => {
        return task.student_login === student.login;
    };

    const req = {
        issue_id: task.issue_id,
        student_login: actor.login,
    };

    switch (command) {
        case "/request-assign":
            if (task.task_status == TaskStatus.RequestAssign) {
                return setResponse(config.comment.requestAssign.claimByOther);
            }

            if (task.task_status !== TaskStatus.Open) {
                return setResponse(config.comment.command.invalidTaskState);
            }

            // 学生身份校验
            const verify = await verifyStudentIdentity(actor.login, scmProvider);
            if (!verify.success) {
                return setResponse(config.comment.requestAssign.waitingInfoReview);
            }

            // 合同签署校验
            // if (!verify.contract_deadline) {
            //     return setResponse(config.comment.requestAssign.waitingContract);
            // }

            if (task.student_login === actor.login) {
                return setResponse(config.comment.requestAssign.alreadyClaim);
            }

            if (!await verifyStudentTask(actor.login, scmProvider)) {
                return setResponse(config.comment.requestAssign.existTask);
            }

            if (await requestAssign(req, task, scmProvider)) {
                return setResponse(config.comment.requestAssign.success, true);
            } else {
                return setResponse("API ERROR");
            }
        case "/request-complete":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState);
            }

            if (!isStudentAuthorized(task, actor)) {
                return setResponse(config.comment.command.noPermission);
            }

            //check related PRs
            // const res = await context.octokit.issues.get({
            //     owner: task.owner,
            //     repo: task.repo,
            //     issue_number: task.issue_number
            // });

            // if (res.data.pull_request == undefined) {
            //     return setResponse(config.requestComplete.noRelatedPR);
            // }
            await requestComplete(req, task, scmProvider)
            return setResponse(config.comment.requestComplete.success, true);

        case "/request-release":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState);
            }

            if (!isStudentAuthorized(task, actor)) {
                return setResponse(config.comment.command.noPermission);
            }

            await releaseTask(req, scm, payload)
            return setResponse(config.comment.requestRelease.success, true);

        default:
            return setResponse(config.comment.command.unsupportStuCommand);
    }
}


interface UserReq {
    login: string
}

interface VerifyStuRes {
    success: true,
    student_name?: string
    contract_deadline?: string,
}

async function verifyStudentIdentity(login: string, scmProvider: Payload["scmProvider"]) {
    const apiUrl = `${process.env.API_ENDPOINT}/student/validate`;
    const body: UserReq & ScmBackendRequestFields = mergeBackendProviderOnly({ login }, scmProvider);
    const res = await postData<VerifyStuRes, typeof body>(apiUrl, body).then((res) => {
        return res.data
    });
    return res
}

async function verifyStudentTask(login: string, scmProvider: Payload["scmProvider"]) {
    const apiUrl = `${process.env.API_ENDPOINT}/student/task`;
    const body: UserReq & ScmBackendRequestFields = mergeBackendProviderOnly({ login }, scmProvider);
    const res = await postData<Task, typeof body>(apiUrl, body).then((res) => {
        return res.data
    });
    return res === null
}



async function requestAssign(req: CommandRequest, task: Task, scmProvider: Payload["scmProvider"]) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/request-assign`;
    const body = mergeBackendWithTask(req, scmProvider, task);
    const res = await postData<boolean, typeof body>(apiUrl, body).then((res) => {
        return res.data
    });
    return res
}

export async function releaseTask(req: CommandRequest, scm: ScmClient, payload: Payload) {
    const { task, issueLabels, scmProvider } = payload;
    if (task == null) {
        return false;
    }
    const claimedLabel = getClaimedLabelName(task.owner, task.repo);
    const existingLabels = issueLabels.some(label => label.name === claimedLabel);
    const tp = scmProjectOptsFromTask(task);
    if (existingLabels) {
        await scm.removeLabel({
            owner: task.owner,
            repo: task.repo,
            issueNumber: task.issue_number,
            name: claimedLabel,
            ...tp,
        });
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
    const apiUrl = `${process.env.API_ENDPOINT}/task/release`;
    const body = mergeBackendWithTask(req, scmProvider, task);
    const res = await postData<boolean, typeof body>(apiUrl, body).then((res) => {
        return res.data
    });
    return res
}

async function requestComplete(
    req: CommandRequest,
    task: Task,
    scmProvider: Payload["scmProvider"],
) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/request-complete`;
    const body = mergeBackendWithTask(req, scmProvider, task);
    const res = await postData<boolean, typeof body>(apiUrl, body).then((res) => {
        return res.data
    });
    return res
}
