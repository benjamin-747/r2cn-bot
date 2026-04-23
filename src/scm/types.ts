/**
 * SCM write/read surface — {@link GitHubScmClient} for GitHub; other providers later.
 * @see docs/dual-webhook-scm-architecture.md §5
 */

/** Decoded UTF-8 file body from `getRepositoryContent`. */
export type RepositoryFileContent = {
    content: string;
};

/** Optional GitLab/Atomgit numeric project id; GitHub client ignores it. */
export type ScmProjectOpts = {
    projectId?: number;
};

export interface ScmClient {
    createIssueComment(
        input: {
            owner: string;
            repo: string;
            issueNumber: number;
            body: string;
        } & ScmProjectOpts,
    ): Promise<void>;

    /** Read a single file from a repository (e.g. org-wide `r2cn.yaml`). */
    getRepositoryContent(
        input: {
            owner: string;
            repo: string;
            path: string;
        } & ScmProjectOpts,
    ): Promise<RepositoryFileContent | null>;

    removeLabel(
        input: {
            owner: string;
            repo: string;
            issueNumber: number;
            name: string;
        } & ScmProjectOpts,
    ): Promise<void>;

    removeAssignees(
        input: {
            owner: string;
            repo: string;
            issueNumber: number;
            assignees: string[];
        } & ScmProjectOpts,
    ): Promise<void>;

    addLabels(
        input: {
            owner: string;
            repo: string;
            issueNumber: number;
            labels: string[];
        } & ScmProjectOpts,
    ): Promise<void>;

    addAssignees(
        input: {
            owner: string;
            repo: string;
            issueNumber: number;
            assignees: string[];
        } & ScmProjectOpts,
    ): Promise<void>;

    updateIssue(
        input: {
            owner: string;
            repo: string;
            issueNumber: number;
            state: "open" | "closed";
        } & ScmProjectOpts,
    ): Promise<void>;

    removeAllLabels(
        input: {
            owner: string;
            repo: string;
            issueNumber: number;
        } & ScmProjectOpts,
    ): Promise<void>;
}
