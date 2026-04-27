
import {
    CommandRequest,
    Config,
    getClaimedLabelName,
    isBackendApiError,
    isCommandApiDataSuccess,
    postData,
} from "../config/index.js";
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
import type { TaskApiResult } from "../task/index.js";

export type StudentCommandBusinessCode =
    | "invalid_task_state"
    | "claim_by_other"
    | "waiting_info_review"
    | "already_claimed_by_same_student"
    | "existing_active_task"
    | "request_assign_success"
    | "request_assign_failed"
    | "no_permission"
    | "request_complete_success"
    | "request_complete_failed"
    | "request_release_success"
    | "request_release_failed"
    | "unsupported_student_command"
    | "api_error";

export interface StudentCommandResult {
    result: boolean;
    message: string;
    apiError: boolean;
    businessCode: StudentCommandBusinessCode;
}

export async function handle_stu_cmd(scm: ScmClient, config: Config, payload: Payload) {
    var command_res: StudentCommandResult = {
        result: false,
        message: "",
        apiError: false,
        businessCode: "invalid_task_state",
    };
    const { actor, command, task, scmProvider } = payload;

    const setResponse = (
        message: string,
        businessCode: StudentCommandBusinessCode,
        result: boolean = false,
        apiError: boolean = false,
    ) => {
        command_res.message = message;
        command_res.result = result;
        command_res.businessCode = businessCode;
        command_res.apiError = apiError;
        return command_res;
    };

    if (task == null) {
        return setResponse(config.comment.command.invalidTaskState, "invalid_task_state");
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
            if (task.student_login === actor.login) {
                return setResponse(config.comment.requestAssign.alreadyClaim, "already_claimed_by_same_student");
            }

            if (task.task_status == TaskStatus.RequestAssign) {
                return setResponse(config.comment.requestAssign.claimByOther, "claim_by_other");
            }

            if (task.task_status !== TaskStatus.Open) {
                return setResponse(config.comment.command.invalidTaskState, "invalid_task_state");
            }

            // 学生身份校验
            const verify = await verifyStudentIdentity(actor.login, scmProvider);
            if (verify.apiError) {
                return setResponse(config.comment.system.apiUnavailable, "api_error", false, true);
            }
            if (!verify.data?.success) {
                return setResponse(config.comment.requestAssign.waitingInfoReview, "waiting_info_review");
            }

            // 合同签署校验
            // if (!verify.contract_deadline) {
            //     return setResponse(config.comment.requestAssign.waitingContract);
            // }



            const taskCheck = await verifyStudentTask(actor.login, scmProvider);
            if (taskCheck.apiError) {
                return setResponse(config.comment.system.apiUnavailable, "api_error", false, true);
            }
            if (!taskCheck.allow) {
                return setResponse(config.comment.requestAssign.existTask, "existing_active_task");
            }

            const assignRes = await requestAssign(req, task, scmProvider);
            if (assignRes.apiError) {
                return setResponse(config.comment.system.apiUnavailable, "api_error", false, true);
            }
            if (assignRes.ok) {
                return setResponse(config.comment.requestAssign.success, "request_assign_success", true);
            } else {
                return setResponse(config.comment.command.invalidTaskState, "request_assign_failed");
            }
        case "/request-complete":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState, "invalid_task_state");
            }

            if (!isStudentAuthorized(task, actor)) {
                return setResponse(config.comment.command.noPermission, "no_permission");
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
            const completeRes = await requestComplete(req, task, scmProvider);
            if (completeRes.apiError) {
                return setResponse(config.comment.system.apiUnavailable, "api_error", false, true);
            }
            if (!completeRes.ok) {
                return setResponse(config.comment.command.invalidTaskState, "request_complete_failed");
            }
            return setResponse(config.comment.requestComplete.success, "request_complete_success", true);

        case "/request-release":
            if (task.task_status !== TaskStatus.Assigned) {
                return setResponse(config.comment.command.invalidTaskState, "invalid_task_state");
            }

            if (!isStudentAuthorized(task, actor)) {
                return setResponse(config.comment.command.noPermission, "no_permission");
            }

            const releaseRes = await releaseTask(req, scm, payload);
            if (releaseRes.apiError) {
                return setResponse(config.comment.system.apiUnavailable, "api_error", false, true);
            }
            if (!releaseRes.ok) {
                return setResponse(config.comment.command.invalidTaskState, "request_release_failed");
            }
            return setResponse(config.comment.requestRelease.success, "request_release_success", true);

        default:
            return setResponse(config.comment.command.unsupportStuCommand, "unsupported_student_command");
    }
}


interface UserReq {
    login: string
}

interface VerifyStuRes {
    success: boolean,
    student_name?: string
    contract_deadline?: string,
}

type PortalEligibilityResponse = {
    eligible?: boolean;
    student?: {
        fullName?: string;
        contractEndAt?: string;
    } | null;
};

async function verifyStudentIdentity(login: string, scmProvider: Payload["scmProvider"]) {
    const portalBase = (process.env.PORTAL_ENDPOINT ?? "").trim().replace(/\/+$/, "");
    if (portalBase === "") {
        return {
            data: null as VerifyStuRes | null,
            apiError: true,
        };
    }
    const queryKey = scmProvider === "atomgit" ? "atomgitUsername" : "githubUsername";
    const query = new URLSearchParams({ [queryKey]: login });
    const apiUrl = `${portalBase}/api/integration/openatom/students/eligibility?${query.toString()}`;
    const authToken = (process.env.OPENATOM_INTEGRATION_TOKEN ?? "").trim();
    const headers: HeadersInit = authToken === "" ? {} : { Authorization: `Bearer ${authToken}` };
    let payload: PortalEligibilityResponse;
    try {
        const res = await fetch(apiUrl, { headers });
        if (!res.ok) {
            return {
                data: null as VerifyStuRes | null,
                apiError: true,
            };
        }
        payload = (await res.json()) as PortalEligibilityResponse;
    } catch {
        return {
            data: null as VerifyStuRes | null,
            apiError: true,
        };
    }
    const mapped: VerifyStuRes = {
        success: payload.eligible === true,
        student_name: payload.student?.fullName,
        contract_deadline: payload.student?.contractEndAt,
    };
    return {
        data: mapped,
        apiError: false,
    };
}

async function verifyStudentTask(login: string, scmProvider: Payload["scmProvider"]) {
    const apiUrl = `${process.env.API_ENDPOINT}/student/task`;
    const body: UserReq & ScmBackendRequestFields = mergeBackendProviderOnly({ login }, scmProvider);
    const apiRes = await postData<Task, typeof body>(apiUrl, body);
    if (isBackendApiError(apiRes)) {
        return { allow: false, apiError: true };
    }
    return { allow: apiRes.data === null, apiError: false };
}



async function requestAssign(req: CommandRequest, task: Task, scmProvider: Payload["scmProvider"]) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/request-assign`;
    const body = mergeBackendWithTask(req, scmProvider, task);
    const apiRes = await postData<boolean, typeof body>(apiUrl, body);
    return {
        ok: isCommandApiDataSuccess(apiRes),
        apiError: isBackendApiError(apiRes),
        message: apiRes.message,
    } as TaskApiResult;
}

export async function releaseTask(req: CommandRequest, scm: ScmClient, payload: Payload) {
    const { task, issueLabels, scmProvider } = payload;
    if (task == null) {
        return {
            ok: false,
            apiError: false,
            message: "task_not_found",
        } as TaskApiResult;
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
    const apiRes = await postData<boolean, typeof body>(apiUrl, body);
    return {
        ok: isCommandApiDataSuccess(apiRes),
        apiError: isBackendApiError(apiRes),
        message: apiRes.message,
    } as TaskApiResult;
}

async function requestComplete(
    req: CommandRequest,
    task: Task,
    scmProvider: Payload["scmProvider"],
) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/request-complete`;
    const body = mergeBackendWithTask(req, scmProvider, task);
    const apiRes = await postData<boolean, typeof body>(apiUrl, body);
    return {
        ok: isCommandApiDataSuccess(apiRes),
        apiError: isBackendApiError(apiRes),
        message: apiRes.message,
    } as TaskApiResult;
}
