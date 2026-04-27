import { Maintainer, Config, fetchData, isBackendApiError, postData } from "../config/index.js";
import type { ScmProvider } from "../canonical/scm-provider.js";
import type { Actor, IssueRef, RepoRef } from "../canonical/refs.js";
import type { ScmBackendRequestFields } from "../api/scm-backend-payload.js";
import { scmBackendFields } from "../api/scm-backend-payload.js";

export interface Task {
    repo: string,
    owner: string,
    issue_number: number,
    repo_id: number,
    issue_id: number,
    score?: number,
    task_status: TaskStatus,
    student_login?: string,
    mentor_login: string,
}

export interface TaskLookupResult {
    task: Task | null;
    apiError: boolean;
    message: string;
}

export interface TaskApiResult {
    ok: boolean;
    apiError: boolean;
    message: string;
    code?: string;
}

export enum TaskStatus {
    Open = "Open",
    Invalid = "Invalid",
    RequestAssign = "RequestAssign",
    Assigned = "Assigned",
    RequestFinish = "RequestFinish",
    Finished = "Finished",
}

export async function getTaskLookup(issue_id: number, provider: ScmProvider): Promise<TaskLookupResult> {
    const base = `${process.env.API_ENDPOINT}/task/issue/${issue_id}`;
    const url = `${base}?${new URLSearchParams({ scm_provider: provider }).toString()}`;
    const apiRes = await fetchData<Task>(url);
    const res = apiRes.data;
    const apiError = isBackendApiError(apiRes);
    console.info("[task/getTask] result", {
        issue_id,
        provider,
        hasTask: res != null,
        apiError,
        apiMessage: apiRes.message,
        task_status: res?.task_status,
        mentor_login: res?.mentor_login,
        student_login: res?.student_login,
    });
    return {
        task: res ?? null,
        apiError,
        message: apiRes.message,
    };
}

export async function getTask(issue_id: number, provider: ScmProvider) {
    const lookup = await getTaskLookup(issue_id, provider);
    return lookup.task;
}

type TaskCreateBase = {
    repo: string,
    owner: string,
    issue_number: number,
    repo_id: number,
    issue_id: number,
    score: number,
    mentor_login: string,
    issue_title: string,
    issue_link: string,
};

type TaskCreateRequest = TaskCreateBase & ScmBackendRequestFields;

export interface NewTaskInput {
    repo: RepoRef;
    issue: IssueRef;
    mentor: Actor;
    score: number;
}

function requireRepoNumericId(repo: RepoRef, op: string): number {
    if (repo.numericId == null) {
        throw new Error(`${op}: repo.numericId is required for backend task API`);
    }
    return repo.numericId;
}

export async function newTask(
    input: NewTaskInput,
    provider: ScmProvider,
): Promise<TaskApiResult> {
    const { repo, issue, mentor, score } = input;
    const repoId = requireRepoNumericId(repo, "newTask");
    const req: TaskCreateRequest = {
        repo: repo.name,
        owner: repo.owner,
        issue_number: issue.number,
        repo_id: repoId,
        issue_id: issue.id,
        score: score,
        mentor_login: mentor.login,
        issue_title: issue.title,
        issue_link: issue.htmlUrl,
        ...scmBackendFields({
            provider,
            fullName: repo.fullName,
            issueNumber: issue.number,
        }),
    };
    const apiUrl = `${process.env.API_ENDPOINT}/task/new`;
    const apiRes = await postData<Task[], typeof req>(apiUrl, req);
    const apiError = isBackendApiError(apiRes);
    return {
        ok: apiRes.data != null,
        apiError,
        message: apiRes.message,
        code: apiRes.code,
    };
}

interface TaskUpdate {
    issue_id: number,
    issue_title: string,
    score: number,
}

export async function updateTaskScore(issue: IssueRef, score: number, provider: ScmProvider) {
    const req = {
        issue_id: issue.id,
        issue_title: issue.title,
        score: score,
        ...scmBackendFields({ provider }),
    } as TaskUpdate & ReturnType<typeof scmBackendFields>;

    const apiUrl = `${process.env.API_ENDPOINT}/task/update-score`;
    const apiRes = await postData<boolean, typeof req>(apiUrl, req);
    const apiError = isBackendApiError(apiRes);
    return {
        ok: apiRes.data != null,
        apiError,
        message: apiRes.message,
    } as TaskApiResult;
}


export interface CheckTaskResults {
    result: boolean,
    message: string,
    apiError: boolean,
}

export async function checkTask(
    repo: RepoRef,
    config: Config,
    maintainer: Maintainer,
    provider: ScmProvider,
) {
    const repoId = requireRepoNumericId(repo, "checkTask");
    var fail_res = {
        result: false,
        message: "",
        apiError: false,
    };

    const apiUrl = `${process.env.API_ENDPOINT}/task/search`;
    const req = {
        repo_id: repoId,
        mentor_login: maintainer.id,
        ...scmBackendFields({
            provider,
            fullName: repo.fullName,
        }),
    }
    const apiRes = await postData<Task[], typeof req>(apiUrl, req);
    const apiError = isBackendApiError(apiRes);
    if (apiError) {
        console.warn("[task/search] api error", {
            repo_id: repoId,
            mentor_login: maintainer.id,
            provider,
            apiUrl,
            message: apiRes.message,
        });
        return {
            result: false,
            message: "task_search_api_error",
            apiError: true,
        };
    }
    const tasks = apiRes.data;
    if (tasks == null) {
        console.warn("[task/search] backend returned null, fallback to empty task list", {
            repo_id: repoId,
            mentor_login: maintainer.id,
            provider,
            apiUrl,
        });
    }
    const safeTasks = tasks ?? [];

    if (safeTasks.length >= maintainer.task) {
        fail_res.message = config.comment.task.userToomanyTask;
        fail_res.apiError = false;
        return fail_res
    }

    return {
        result: true,
        message: "",
        apiError: false,
    }
}
