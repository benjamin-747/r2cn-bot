import type { RepoRef } from "../canonical/refs.js";
import type { Task } from "../task/index.js";

export function scmProjectOptsFromRepo(repo: RepoRef): { projectId?: number } {
    return repo.numericId != null ? { projectId: repo.numericId } : {};
}

export function scmProjectOptsFromTask(task: Task): { projectId: number } {
    return { projectId: task.repo_id };
}
