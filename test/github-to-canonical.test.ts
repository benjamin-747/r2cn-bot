import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IssueCommentCreatedEvent, IssuesLabeledEvent } from "@octokit/webhooks-types";
import { describe, expect, test } from "vitest";
import {
    githubIssueCommentCreatedToCanonical,
    githubIssuesLabeledToCanonical,
} from "../src/webhooks/map-github-to-canonical.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("GitHub → Canonical (phase 1)", () => {
    test("issues.labeled maps to IssueLabeled", () => {
        const raw = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, "fixtures/issues.labeled-non-score-prefix.json"),
                "utf-8",
            ),
        );
        const payload = raw as unknown as IssuesLabeledEvent;

        const ev = githubIssuesLabeledToCanonical(payload, "del-123");
        expect(ev).not.toBeNull();
        expect(ev!.kind).toBe("IssueLabeled");
        expect(ev!.repo).toEqual({
            provider: "github",
            owner: "hiimbex",
            name: "testing-things",
            fullName: "hiimbex/testing-things",
            numericId: 99,
        });
        expect(ev!.issue.number).toBe(1);
        expect(ev!.label.name).toBe("bug");
        expect(ev!.labels).toEqual([{ name: "bug" }]);
        expect(ev!.delivery?.deliveryId).toBe("del-123");
        expect(ev!.issueAuthor?.login).toBe("hiimbex");
    });

    test("issue_comment.created maps to IssueCommentCreated", () => {
        const payload = {
            action: "created" as const,
            issue: {
                id: 10,
                number: 3,
                title: "T",
                html_url: "https://github.com/o/r/issues/3",
                user: {
                    login: "author",
                    id: 1,
                    node_id: "n",
                    avatar_url: "",
                    gravatar_id: "",
                    url: "",
                    html_url: "",
                    followers_url: "",
                    following_url: "",
                    gists_url: "",
                    starred_url: "",
                    subscriptions_url: "",
                    organizations_url: "",
                    repos_url: "",
                    events_url: "",
                    received_events_url: "",
                    type: "User" as const,
                    site_admin: false,
                },
                assignee: null,
                state: "open" as const,
                locked: false,
                labels: [],
            },
            comment: {
                id: 100,
                node_id: "cn",
                url: "",
                html_url: "",
                issue_url: "",
                user: {
                    login: "commenter",
                    id: 2,
                    node_id: "n2",
                    avatar_url: "",
                    gravatar_id: "",
                    url: "",
                    html_url: "",
                    followers_url: "",
                    following_url: "",
                    gists_url: "",
                    starred_url: "",
                    subscriptions_url: "",
                    organizations_url: "",
                    repos_url: "",
                    events_url: "",
                    received_events_url: "",
                    type: "User" as const,
                    site_admin: false,
                },
                created_at: "",
                updated_at: "",
                author_association: "NONE" as const,
                body: "/request-assign",
                reactions: {
                    url: "",
                    total_count: 0,
                    "+1": 0,
                    "-1": 0,
                    laugh: 0,
                    confused: 0,
                    heart: 0,
                    hooray: 0,
                    eyes: 0,
                    rocket: 0,
                },
            },
            repository: {
                id: 20,
                node_id: "rn",
                name: "r",
                full_name: "o/r",
                private: false,
                owner: {
                    login: "o",
                    id: 3,
                    node_id: "o",
                    avatar_url: "",
                    gravatar_id: "",
                    url: "",
                    html_url: "",
                    followers_url: "",
                    following_url: "",
                    gists_url: "",
                    starred_url: "",
                    subscriptions_url: "",
                    organizations_url: "",
                    repos_url: "",
                    events_url: "",
                    received_events_url: "",
                    type: "User" as const,
                    site_admin: false,
                },
                html_url: "",
                description: null,
                fork: false,
                url: "",
                created_at: "",
                updated_at: "",
                pushed_at: "",
                homepage: null,
                size: 0,
                stargazers_count: 0,
                watchers_count: 0,
                language: null,
                has_issues: true,
                has_projects: true,
                has_downloads: true,
                has_wiki: true,
                has_pages: false,
                has_discussions: false,
                forks_count: 0,
                archived: false,
                disabled: false,
                open_issues_count: 0,
                license: null,
                visibility: "public",
                default_branch: "main",
            },
            sender: {
                login: "commenter",
                id: 2,
                node_id: "n2",
                avatar_url: "",
                gravatar_id: "",
                url: "",
                html_url: "",
                followers_url: "",
                following_url: "",
                gists_url: "",
                starred_url: "",
                subscriptions_url: "",
                organizations_url: "",
                repos_url: "",
                events_url: "",
                received_events_url: "",
                type: "User" as const,
                site_admin: false,
            },
        } as unknown as IssueCommentCreatedEvent;

        const ev = githubIssueCommentCreatedToCanonical(payload, {
            deliveryId: "d2",
            isBot: false,
        });
        expect(ev).not.toBeNull();
        expect(ev!.kind).toBe("IssueCommentCreated");
        expect(ev!.body).toBe("/request-assign");
        expect(ev!.actor.login).toBe("commenter");
        expect(ev!.isBot).toBe(false);
        expect(ev!.repo.fullName).toBe("o/r");
        expect(ev!.issueLabels).toEqual([]);
        expect(ev!.issueAuthor?.login).toBe("author");
    });

    test("githubIssuesLabeledToCanonical returns null without label", () => {
        const payload = {
            action: "labeled" as const,
            issue: {
                id: 1,
                number: 1,
                title: "t",
                html_url: "http://x",
                user: {
                    login: "u",
                    id: 1,
                    node_id: "",
                    avatar_url: "",
                    gravatar_id: "",
                    url: "",
                    html_url: "",
                    followers_url: "",
                    following_url: "",
                    gists_url: "",
                    starred_url: "",
                    subscriptions_url: "",
                    organizations_url: "",
                    repos_url: "",
                    events_url: "",
                    received_events_url: "",
                    type: "User" as const,
                    site_admin: false,
                },
                labels: [],
            },
            repository: {
                id: 1,
                node_id: "",
                name: "r",
                full_name: "o/r",
                private: false,
                owner: {
                    login: "o",
                    id: 1,
                    node_id: "",
                    avatar_url: "",
                    gravatar_id: "",
                    url: "",
                    html_url: "",
                    followers_url: "",
                    following_url: "",
                    gists_url: "",
                    starred_url: "",
                    subscriptions_url: "",
                    organizations_url: "",
                    repos_url: "",
                    events_url: "",
                    received_events_url: "",
                    type: "User" as const,
                    site_admin: false,
                },
                html_url: "",
                description: null,
                fork: false,
                url: "",
                created_at: "",
                updated_at: "",
                pushed_at: "",
                homepage: null,
                size: 0,
                stargazers_count: 0,
                watchers_count: 0,
                language: null,
                has_issues: true,
                has_projects: true,
                has_downloads: true,
                has_wiki: true,
                has_pages: false,
                has_discussions: false,
                forks_count: 0,
                archived: false,
                disabled: false,
                open_issues_count: 0,
                license: null,
                visibility: "public",
                default_branch: "main",
            },
            sender: {
                login: "u",
                id: 1,
                node_id: "",
                avatar_url: "",
                gravatar_id: "",
                url: "",
                html_url: "",
                followers_url: "",
                following_url: "",
                gists_url: "",
                starred_url: "",
                subscriptions_url: "",
                organizations_url: "",
                repos_url: "",
                events_url: "",
                received_events_url: "",
                type: "User" as const,
                site_admin: false,
            },
        } as unknown as IssuesLabeledEvent;

        expect(githubIssuesLabeledToCanonical(payload, "x")).toBeNull();
    });
});
