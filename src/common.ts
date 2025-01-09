import axios, { AxiosResponse } from "axios";

export interface Config {
    repos: Repo[];
    project: projectComment,
    task: TaskComment,
}

interface projectComment {
    noneProjectComment: string,
    noneMaintainerComment: string,
}

interface TaskComment {
    scoreUndefinedComment: string,
    scoreInvalidComment: string,
    insufficientScoreComment: string,
    toomanyTask: string,
}

interface Repo {
    name: string,
    maintainers: string[]
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