import { Issue, Repository } from "@octokit/webhooks-types";
import { Config, fetchData, postData } from "./common.js";

interface Task {
    github_repo_id: number,
    github_issue_id: number,
    points?: number,
    task_status: TaskStatus,
    student_github_id?: number,
    mentor_github_id: number,
}

enum TaskStatus {
    Open,
    Invalid,
    RequestAssign,
    Assigned,
    RequestFinish,
    Finished,
}

export async function getTask(issue_id: number) {
    const apiUrl = `${process.env.API_ENDPOINT}/task/issue/${issue_id}`;
    const res = await fetchData<Task>(apiUrl).then((res) => {
        return res.data
    });
    return res
}

interface newTask {
    github_repo_id: number,
    github_issue_id: number,
    score: number,
    mentor_github_id: number,
}

export async function newTask(repo: Repository, issue: Issue, score: number) {
    let req = {
        github_repo_id: repo.id,
        github_issue_id: issue.id,
        score: score,
        mentor_github_id: issue.user.id,
    }
    const apiUrl = `${process.env.API_ENDPOINT}/task/new`;
    const res = await postData<Task[], SearchTaskReq>(apiUrl, req).then((res) => {
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
    score: number,
}

interface SearchTaskReq {
    github_repo_id: number
}
export async function checkTask(repo: Repository, issue: Issue, config: Config) {

    const label = issue.labels?.find(label => label.name.startsWith("r2cn"));
    var scoreStr = label?.name.split('-')[1];
    var score = 0;
    var fail_res = {
        result: false,
        message: "",
        score: 0
    };

    if (scoreStr == undefined) {
        fail_res.message = config.task.scoreUndefinedComment;
        return fail_res
    } else {
        score = parseInt(scoreStr)
    }

    if (score > 50 || score < 2) {
        fail_res.message = config.task.scoreInvalidComment;
        return fail_res
    }

    const apiUrl = `${process.env.API_ENDPOINT}/task/search`;
    let req = {
        github_repo_id: repo.id
    }
    const tasks: Task[] = await postData<Task[], SearchTaskReq>(apiUrl, req).then((res) => {
        return res.data
    });

    if (tasks.length >= 3) {
        fail_res.message = config.task.toomanyTask;
        return fail_res
    }

    return {
        result: true,
        message: "",
        score: score
    }
}