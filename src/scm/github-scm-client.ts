import type { Octokit } from "octokit";
import type { RepositoryFileContent, ScmClient } from "./types.js";

/**
 * GitHub implementation of {@link ScmClient} using the installation-scoped Octokit from Probot.
 */
export class GitHubScmClient implements ScmClient {
    constructor(private readonly octokit: Octokit) {}

    async createIssueComment(
        input: {
            owner: string;
            repo: string;
            issueNumber: number;
            body: string;
            projectId?: number;
        },
    ): Promise<void> {
        await this.octokit.rest.issues.createComment({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
            body: input.body,
        });
    }

    async getRepositoryContent(input: {
        owner: string;
        repo: string;
        path: string;
        projectId?: number;
    }): Promise<RepositoryFileContent | null> {
        const res = await this.octokit.rest.repos.getContent({
            owner: input.owner,
            repo: input.repo,
            path: input.path,
        });
        if (Array.isArray(res.data)) {
            return null;
        }
        if (!("type" in res.data) || res.data.type !== "file") {
            return null;
        }
        if (!("content" in res.data) || typeof res.data.content !== "string") {
            return null;
        }
        const raw = res.data.content.replace(/\n/g, "");
        const content = Buffer.from(raw, "base64").toString("utf8");
        return { content };
    }

    async removeLabel(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        name: string;
        projectId?: number;
    }): Promise<void> {
        await this.octokit.rest.issues.removeLabel({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
            name: input.name,
        });
    }

    async removeAssignees(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        assignees: string[];
        projectId?: number;
    }): Promise<void> {
        await this.octokit.rest.issues.removeAssignees({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
            assignees: input.assignees,
        });
    }

    async addLabels(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        labels: string[];
        projectId?: number;
    }): Promise<void> {
        await this.octokit.rest.issues.addLabels({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
            labels: input.labels,
        });
    }

    async addAssignees(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        assignees: string[];
        projectId?: number;
    }): Promise<void> {
        await this.octokit.rest.issues.addAssignees({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
            assignees: input.assignees,
        });
    }

    async updateIssue(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        state: "open" | "closed";
        projectId?: number;
    }): Promise<void> {
        await this.octokit.rest.issues.update({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
            state: input.state,
        });
    }

    async removeAllLabels(input: {
        owner: string;
        repo: string;
        issueNumber: number;
        projectId?: number;
    }): Promise<void> {
        await this.octokit.rest.issues.removeAllLabels({
            owner: input.owner,
            repo: input.repo,
            issue_number: input.issueNumber,
        });
    }
}
