import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
    adaptGithubIssueCommentCreated,
    adaptGithubIssuesLabeled,
} from "../src/webhooks/github-adapter.js";
import { atomgitWebhookToCanonical } from "../src/webhooks/map-atomgit-to-canonical.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFixture(rel: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(__dirname, rel), "utf8"));
}

describe("GitHub + Atomgit adapters → Canonical (phase 5 snapshots)", () => {
    test("GitHub issues.labeled → IssueLabeled", () => {
        const raw = readFixture("fixtures/issues.labeled-non-score-prefix.json");
        const c = adaptGithubIssuesLabeled(
            raw as Parameters<typeof adaptGithubIssuesLabeled>[0],
            "delivery-labeled-1",
        );
        expect(JSON.parse(JSON.stringify(c))).toMatchSnapshot();
    });

    test("GitHub issue_comment.created → IssueCommentCreated", () => {
        const raw = readFixture("fixtures/github/issue_comment.created-unknown-cmd.json");
        const c = adaptGithubIssueCommentCreated(
            raw as Parameters<typeof adaptGithubIssueCommentCreated>[0],
            { deliveryId: "delivery-comment-1", isBot: false },
        );
        expect(JSON.parse(JSON.stringify(c))).toMatchSnapshot();
    });

    test("Atomgit Note Hook JSON → IssueCommentCreated", () => {
        const body = readFixture("fixtures/atomgit/note-hook-issue.json") as Record<
            string,
            unknown
        >;
        const c = atomgitWebhookToCanonical({
            eventHeader: "Note Hook",
            body,
            deliveryId: "delivery-atomgit-1",
        });
        expect(JSON.parse(JSON.stringify(c))).toMatchSnapshot();
    });
});
