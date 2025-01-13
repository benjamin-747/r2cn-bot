import axios, { AxiosResponse } from "axios";

export interface Config {
    repos: Repo[];
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
}

interface ProjectComment {
    noneProjectComment: string,
    noneMaintainerComment: string,
}

interface TaskComment {
    scoreUndefinedComment: string,
    scoreInvalidComment: string,
    insufficientScoreComment: string,
    toomanyTask: string,
}

interface CommandComment {
    noPermission: string,
    invalidTaskState: string,
}

interface RequestAssign {
    success: string,
    waitingInfoReview: string,
    existTask: string,
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
interface Repo {
    name: string,
    maintainers: string[]
}

export interface CommandRequest {
    github_issue_id: number,
    login?: string
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