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

interface TaskComment {
    success: string,
    successUpdate: string,
    notAllowedModify: string,
    taskNotFound: string,
    scoreUndefinedComment: string,
    multiScoreLabel: string,
    scoreInvalidComment: string,
    userToomanyTask: string,
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

interface ApiResponse<T> {
    message: string;
    data: T;
}

const http = axios.create({
    headers: { "Content-Type": "application/json" },
});

function toFailedApiResponse<T>(error: unknown): ApiResponse<T> {
    if (axios.isAxiosError(error)) {
        const e = error as AxiosError<{ message?: string }>;
        const status = e.response?.status;
        const backendMessage = e.response?.data?.message;
        const msg =
            backendMessage ??
            (status != null ? `HTTP ${status}: ${e.message}` : e.message) ??
            "Unknown error occurred";
        return { message: msg, data: null as unknown as T };
    }
    if (error instanceof Error) {
        return { message: error.message, data: null as unknown as T };
    }
    return { message: "Unknown error occurred", data: null as unknown as T };
}

export const fetchData = async <T>(url: string): Promise<ApiResponse<T>> => {
    try {
        console.info("[api] request", { method: "GET", url });
        const response: AxiosResponse<ApiResponse<T>> = await http.get(url);
        console.info("[api] response", { method: "GET", url, message: response.data.message });
        return response.data;
    } catch (error: unknown) {
        const failed = toFailedApiResponse<T>(error);
        console.error("[api] error", { method: "GET", url, error: failed.message });
        return failed;
    }
};

export const postData = async <T, U>(url: string, payload: U): Promise<ApiResponse<T>> => {
    try {
        console.info("[api] request", { method: "POST", url, payload });
        const response: AxiosResponse<ApiResponse<T>> = await http.post(url, payload);
        console.info("[api] response", { method: "POST", url, message: response.data.message });
        return response.data;
    } catch (error: unknown) {
        const failed = toFailedApiResponse<T>(error);
        console.error("[api] error", {
            method: "POST",
            url,
            error: failed.message,
            payload,
        });
        return failed;
    }
};
