import type { ScmProvider } from "../canonical/scm-provider.js";

/**
 * SCM metadata appended to backend request bodies during phase-6 dual-contract rollout
 * (docs §7, §8.8). Legacy `github_*` keys are preserved for backward compatibility.
 */
export type ScmBackendRequestFields = {
    scm_provider: ScmProvider;
    external_ref?: string;
};

export type TaskLikeForBackend = {
    repo_id: number;
    issue_id: number;
    owner: string;
    repo: string;
    issue_number: number;
};

export function scmBackendFields(opts: {
    provider: ScmProvider;
    fullName?: string;
    issueNumber?: number;
}): ScmBackendRequestFields {
    const o: ScmBackendRequestFields = { scm_provider: opts.provider };
    if (opts.fullName != null && opts.issueNumber != null) {
        o.external_ref = `${opts.provider}:${opts.fullName}#${opts.issueNumber}`;
    }
    return o;
}

export function mergeBackendProviderOnly<T extends object>(
    body: T,
    provider: ScmProvider,
): T & ScmBackendRequestFields {
    return { ...body, ...scmBackendFields({ provider }) };
}

export function mergeBackendWithTask<T extends object>(
    body: T,
    provider: ScmProvider,
    task: TaskLikeForBackend,
): T & ScmBackendRequestFields {
    return {
        ...body,
        ...scmBackendFields({
            provider,
            fullName: `${task.owner}/${task.repo}`,
            issueNumber: task.issue_number,
        }),
    };
}
