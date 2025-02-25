import axios, { AxiosResponse } from "axios";

export interface R2CN {
    repos: Repo[];
}

interface Repo {
    name: string,
    maintainers: Maintainer[]
}

export interface Maintainer {
    id: string,
    task: number,
    maxScore: number
}

export interface Config {
    comment: BotComment,
    r2cn: R2CN,
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

export interface CommandRequest {
    github_issue_id: number,
    student_login?: string
}

interface ApiResponse<T> {
    message: string;
    data: T;
}

export const fetchData = async <T>(url: string): Promise<ApiResponse<T>> => {
    try {
        const response: AxiosResponse<ApiResponse<T>> = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        console.log('External API response:', response.data);
        return response.data;
    } catch (error: any) {
        console.error('Error fetching external API:', error);
        return {
            message: error.message || 'Unknown error occurred',
            data: null,
        } as ApiResponse<T>;
    }
};

export const postData = async <T, U>(url: string, payload: U): Promise<ApiResponse<T>> => {
    try {
        const response: AxiosResponse<ApiResponse<T>> = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
        console.log('External API response:', response.data);
        return response.data;
    } catch (error: any) {
        console.error('Error posting external API:', error);
        return {
            message: error.message || 'Unknown error occurred',
            data: null,
        } as ApiResponse<T>;
    }
};