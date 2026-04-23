import { Maintainer, Config, fetchData, postData } from "../config/index.js";
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

export enum TaskStatus {
    Open = "Open",
    Invalid = "Invalid",
    RequestAssign = "RequestAssign",
    Assigned = "Assigned",
    RequestFinish = "RequestFinish",
    Finished = "Finished",
}

export async function getTask(issue_id: number, provider: ScmProvider) {
    const base = `${process.env.API_ENDPOINT}/task/issue/${issue_id}`;
    const url = `${base}?${new URLSearchParams({ scm_provider: provider }).toString()}`;
    const res = await fetchData<Task>(url).then((res) => {
        return res.data
    });
    return res
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
) {
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
    const res = await postData<Task[], typeof req>(apiUrl, req).then((res) => {
        return res.data
    });
    if (res != undefined) {
        return true
    } else {
        return false
    }
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
    const res = await postData<boolean, typeof req>(apiUrl, req).then((res) => {
        return res.data
    });
    if (res != undefined) {
        return true
    } else {
        return false
    }
}


export interface CheckTaskResults {
    result: boolean,
    message: string,
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
    const tasks = await postData<Task[], typeof req>(apiUrl, req).then((res) => {
        return res.data
    });
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
        return fail_res
    }

    return {
        result: true,
        message: "",
    }
}
