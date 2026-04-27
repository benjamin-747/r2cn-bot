import axios, { AxiosError, AxiosResponse } from "axios";

export interface ApprovedRepositoryConfig {
    name: string,
    maintainers: Maintainer[]
}

export interface ApprovedRepositoriesConfigFile {
    repos: ApprovedRepositoryConfig[];
}

export interface Maintainer {
    id: string,
    task: number,
    maxScore: number
}

export interface Config {
    comment: BotComment,
    approvedRepositories: ApprovedRepositoryConfig[],
}

export interface BotComment {
    project: ProjectComment,
    system: SystemComment,
    task: TaskComment,
    command: CommandComment,
    requestAssign: RequestAssign,
    internDisapprove: InternDisapprove,
    internApprove: InternApprove
    requestComplete: RequestComplete,
    requestRelease: RequestRelease,
    internFail: InternFail,
    internDone: InternDone,
    internClose: InternClose,
}


interface ProjectComment {
    noneProjectComment: string,
    noneMaintainerComment: string,
}

interface SystemComment {
    apiUnavailable: string,
    webhookTokenMismatch: string,
}

interface TaskComment {
    success: string,
    successUpdate: string,
    notAllowedModify: string,
    taskNotFound: string,
    scoreUndefinedComment: string,
    multiScoreLabel: string,
    scoreInvalidComment: string,
    userToomanyTask: string,
    budgetExceeded: string,
}

interface CommandComment {
    noPermission: string,
    invalidTaskState: string,
    unsupportStuCommand: string,
    unsupportMentorCommand: string,
}

interface RequestAssign {
    success: string,
    waitingInfoReview: string,
    waitingContract: string,
    existTask: string,
    claimByOther: string,
    alreadyClaim: string,
}

interface InternDisapprove {
    success: string
}

interface InternApprove {
    success: string
}

interface RequestComplete {
    success: string
    noRelatedPR: string,
}

interface RequestRelease {
    success: string
}

interface InternFail {
    success: string
}

interface InternDone {
    success: string
}

interface InternClose {
    success: string
}

export const getClaimedLabelName = (owner: string, repo: string) => {
    const repoFullName = `${owner}/${repo}`;
    return repoFullName === "rustfs/rustfs" ? "claimed" : "已认领";
};

export interface CommandRequest {
    issue_id: number,
    student_login?: string
}

export interface ApiResponse<T> {
    message: string;
    data: T;
    status?: number;
    code?: string;
}

const http = axios.create({
    headers: { "Content-Type": "application/json" },
});

const NON_ERROR_MESSAGES = new Set([
    "success",
    "Task Not Found",
]);

export function isBackendApiError<T>(res: Pick<ApiResponse<T>, "message" | "data">): boolean {
    const withStatus = res as Pick<ApiResponse<T>, "message" | "data" | "status">;
    const message = String(res.message ?? "").trim();
    if (res.data != null) {
        return false;
    }
    // Treat 4xx as business/domain failures, not service unavailability.
    if (withStatus.status != null && withStatus.status >= 400 && withStatus.status < 500) {
        return false;
    }
    // Explicit 5xx means backend/service failure.
    if (withStatus.status != null && withStatus.status >= 500) {
        return true;
    }
    if (message === "" || NON_ERROR_MESSAGES.has(message)) {
        return false;
    }
    // Network-level failures from Axios/fetch-like stacks.
    if (/(ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|network error|socket hang up)/i.test(message)) {
        return true;
    }
    // Keep this conservative: unknown textual messages without status are treated as business errors.
    return false;
}

/**
 * Some task/command POST endpoints return `{ data: true }` on success; others return
 * `{ data: <Task | record> }` with HTTP 200. This treats both as success; `data === false` or
 * `data == null` counts as failure.
 */
export function isCommandApiDataSuccess<T>(res: Pick<ApiResponse<T>, "data">): boolean {
    const d = res.data as unknown;
    if (d === true) {
        return true;
    }
    if (d === false || d == null) {
        return false;
    }
    if (typeof d === "object") {
        return true;
    }
    return true;
}

function toFailedApiResponse<T>(error: unknown): ApiResponse<T> {
    if (axios.isAxiosError(error)) {
        const e = error as AxiosError<{ message?: string }>;
        const status = e.response?.status;
        const backendMessage = e.response?.data?.message;
        const msg =
            backendMessage ??
            (status != null ? `HTTP ${status}: ${e.message}` : e.message) ??
            "Unknown error occurred";
        return { message: msg, data: null as unknown as T, status };
    }
    if (error instanceof Error) {
        return { message: error.message, data: null as unknown as T };
    }
    return { message: "Unknown error occurred", data: null as unknown as T };
}

function logApiAxiosError(
    method: "GET" | "POST",
    url: string,
    payload: unknown,
    error: unknown,
    failedMessage: string,
): void {
    if (axios.isAxiosError(error)) {
        const e = error as AxiosError<unknown>;
        const base: Record<string, unknown> = {
            method,
            url,
            status: e.response?.status,
            body: e.response?.data,
            message: e.message,
            error: failedMessage,
        };
        if (method === "POST") {
            base.payload = payload;
        }
        console.error("[api] error", base);
        return;
    }
    console.error("[api] error", { method, url, error: failedMessage, cause: error });
}

export const fetchData = async <T>(url: string): Promise<ApiResponse<T>> => {
    try {
        console.info("[api] request", { method: "GET", url });
        const response: AxiosResponse<ApiResponse<T>> = await http.get(url);
        console.info("[api] response", {
            method: "GET",
            url,
            status: response.status,
            body: response.data,
        });
        return response.data;
    } catch (error: unknown) {
        const failed = toFailedApiResponse<T>(error);
        logApiAxiosError("GET", url, undefined, error, failed.message);
        return failed;
    }
};

export const postData = async <T, U>(url: string, payload: U): Promise<ApiResponse<T>> => {
    try {
        console.info("[api] request", { method: "POST", url, payload });
        const response: AxiosResponse<ApiResponse<T>> = await http.post(url, payload);
        console.info("[api] response", {
            method: "POST",
            url,
            status: response.status,
            body: response.data,
        });
        return response.data;
    } catch (error: unknown) {
        const failed = toFailedApiResponse<T>(error);
        logApiAxiosError("POST", url, payload, error, failed.message);
        return failed;
    }
};
