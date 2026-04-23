import type { RepositoryFileContent, ScmClient } from "./types.js";

type ProjectInput = { owner: string; repo: string; projectId?: number };

/**
 * Atomgit REST client. **v5** repo routes:
 * - `POST .../issues/:number/comments`
 * - `POST .../issues/:number/labels`
 * - `PATCH .../repos/:owner/issues/:number` — update issue (path `:owner` = **namespace**; **`repo` + `title` required** in `application/x-www-form-urlencoded` per [AtomGit / GitCode](https://docs.atomgit.com/docs/apis/patch-api-v-5-repos-owner-issues-number)).
 * **`addAssignees` / `removeAssignees`** are intentionally not implemented (no-op) until Atomgit v5 assignee APIs are wired.
 * Other operations may still use GitLab-style `/projects/...` until aligned.
 * Set `ATOMGIT_API_BASE` to the API root, e.g. `https://api.atomgit.com/api/v5`.
 * @see docs/dual-webhook-scm-architecture.md §5、§8.6
 */
export class AtomgitScmClient implements ScmClient {
    private readonly baseUrl: string;
    private readonly token: string;
    private readonly apiVersion: string;
    private readonly defaultBranch: string;

    constructor() {
        const base = process.env.ATOMGIT_API_BASE?.replace(/\/+$/, "") ?? "";
        if (base === "") {
            throw new Error("ATOMGIT_API_BASE is required for AtomgitScmClient");
        }
        const token = process.env.ATOMGIT_TOKEN ?? "";
        if (token === "") {
            throw new Error("ATOMGIT_TOKEN is required for AtomgitScmClient");
        }
        this.baseUrl = base;
        this.token = token;
        this.apiVersion = process.env.ATOMGIT_API_VERSION ?? "2023-02-21";
        this.defaultBranch = process.env.ATOMGIT_DEFAULT_BRANCH ?? "main";
    }

    private projectRef(input: ProjectInput): string {
        if (input.projectId != null) {
            return String(input.projectId);
        }
        return encodeURIComponent(`${input.owner}/${input.repo}`);
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "X-Api-Version": this.apiVersion,
        };
    }

    private async request(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<Response> {
        const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
        return fetch(url, {
            method,
            headers: this.headers(),
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    }

    /** `POST /repos/:owner/:repo/issues/:number/comments` (Atomgit v5). */
    private issueCommentsPath(owner: string, repo: string, issueNumber: number): string {
        return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`;
    }

    /** `POST /repos/:owner/:repo/issues/:number/labels` (Atomgit v5). */
    private issueLabelsPath(owner: string, repo: string, issueNumber: number): string {
        return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`;
    }

    /** `GET /repos/:owner/:repo/issues/:number` — load issue before PATCH (GitCode v5). */
    private issueGetV5Path(owner: string, repo: string, issueNumber: number): string {
        return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`;
    }

    /**
     * `PATCH /repos/:owner/issues/:number` — path `:owner` is namespace only; `repo` is sent in form body.
     * @see https://docs.atomgit.com/docs/apis/patch-api-v-5-repos-owner-issues-number
     */
    private issuePatchV5Path(owner: string, issueNumber: number): string {
        return `/repos/${encodeURIComponent(owner)}/issues/${issueNumber}`;
    }

    private async fetchIssueSnapshotForUpdate(
        owner: string,
        repo: string,
        issueNumber: number,
    ): Promise<{ title: string; body: string }> {
        const url = `${this.baseUrl}${this.issueGetV5Path(owner, repo, issueNumber)}`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/json",
                "X-Api-Version": this.apiVersion,
            },
        });
        if (!res.ok) {
            throw new Error(
                `Atomgit updateIssue: GET issue failed ${res.status} ${await res.text()}`,
            );
        }
        const data = (await res.json()) as { title?: unknown; body?: unknown };
        const title = typeof data.title === "string" ? data.title : "";
        const body = typeof data.body === "string" ? data.body : "";
        if (title.trim() === "") {
            throw new Error("Atomgit updateIssue: issue title from API is blank");
        }
        return { title, body };
    }

    async createIssueComment(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        body: string;
        projectId?: number;
    }): Promise<void> {
        const res = await this.request(
            "POST",
            this.issueCommentsPath(input.owner, input.repo, input.issueNumber),
            { body: input.body },
        );
        if (!res.ok) {
            throw new Error(
                `Atomgit createIssueComment failed: ${res.status} ${await res.text()}`,
            );
        }
    }

    async getRepositoryContent(input: {
        owner: string;
        repo: string;
        path: string;
        projectId?: number;
    }): Promise<RepositoryFileContent | null> {
        const pid = this.projectRef(input);
        const file = encodeURIComponent(input.path);
        const ref = encodeURIComponent(this.defaultBranch);
        const res = await fetch(
            `${this.baseUrl}/projects/${pid}/repository/files/${file}/raw?ref=${ref}`,
            { headers: { Authorization: `Bearer ${this.token}`, "X-Api-Version": this.apiVersion } },
        );
        if (!res.ok) {
            return null;
        }
        const content = await res.text();
        return { content };
    }

    async removeLabel(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        name: string;
        projectId?: number;
    }): Promise<void> {
        const pid = this.projectRef(input);
        const name = encodeURIComponent(input.name);
        const res = await this.request(
            "DELETE",
            `/projects/${pid}/issues/${input.issueNumber}/labels?name=${name}`,
        );
        if (!res.ok && res.status !== 404) {
            throw new Error(
                `Atomgit removeLabel failed: ${res.status} ${await res.text()}`,
            );
        }
    }

    async removeAssignees(_input: {
        owner: string;
        repo: string;
        issueNumber: number;
        assignees: string[];
        projectId?: number;
    }): Promise<void> {
        return;
    }

    async addLabels(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        labels: string[];
        projectId?: number;
    }): Promise<void> {
        if (input.labels.length === 0) {
            return;
        }
        // AtomGit OpenAPI: body is a JSON **array of label name strings**, not `{ labels: [...] }`.
        const res = await this.request(
            "POST",
            this.issueLabelsPath(input.owner, input.repo, input.issueNumber),
            input.labels,
        );
        if (!res.ok) {
            throw new Error(
                `Atomgit addLabels failed: ${res.status} ${await res.text()}`,
            );
        }
    }

    async addAssignees(_input: {
        owner: string;
        repo: string;
        issueNumber: number;
        assignees: string[];
        projectId?: number;
    }): Promise<void> {
        return;
    }

    async updateIssue(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        state: "open" | "closed";
        projectId?: number;
    }): Promise<void> {
        const { title, body } = await this.fetchIssueSnapshotForUpdate(
            input.owner,
            input.repo,
            input.issueNumber,
        );
        // GitCode PATCH expects form fields; `title` and `repo` are required (JSON-only `state` → PARAMETER_ERROR / must not be blank).
        const params = new URLSearchParams();
        params.set("repo", input.repo);
        params.set("title", title);
        params.set("body", body.trim() === "" ? " " : body);
        params.set("state", input.state === "closed" ? "close" : "reopen");

        const url = `${this.baseUrl}${this.issuePatchV5Path(input.owner, input.issueNumber)}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "X-Api-Version": this.apiVersion,
            },
            body: params.toString(),
        });
        if (!res.ok) {
            throw new Error(
                `Atomgit updateIssue failed: ${res.status} ${await res.text()}`,
            );
        }
    }

    async removeAllLabels(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        projectId?: number;
    }): Promise<void> {
        const pid = this.projectRef(input);
        const res = await this.request(
            "PUT",
            `/projects/${pid}/issues/${input.issueNumber}`,
            { labels: [] },
        );
        if (!res.ok) {
            throw new Error(
                `Atomgit removeAllLabels failed: ${res.status} ${await res.text()}`,
            );
        }
    }
}
