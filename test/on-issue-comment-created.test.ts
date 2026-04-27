import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, expect, vi, afterEach } from "vitest";
import type { Logger } from "pino";
import * as Task from "../src/task/index.js";
import { adaptGithubIssueCommentCreated } from "../src/webhooks/github-adapter.js";
import { onIssueCommentCreated } from "../src/handlers/on-issue-comment-created.js";
import { createMockScmClient } from "./mock-scm-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const noopLog = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => noopLog,
} as unknown as Logger;

describe("onIssueCommentCreated (phase 5)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    test("unknown slash command posts generic error when task exists", async () => {
        const raw = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, "fixtures/github/issue_comment.created-unknown-cmd.json"),
                "utf8",
            ),
        );
        const event = adaptGithubIssueCommentCreated(raw, {
            deliveryId: "d-comment",
            isBot: false,
        });
        expect(event).not.toBeNull();

        const scm = createMockScmClient();

        vi.spyOn(Task, "getTaskLookup").mockResolvedValue({
            task: {
                repo: "r",
                owner: "o",
                issue_number: 5,
                repo_id: 99,
                issue_id: 100,
                task_status: Task.TaskStatus.Assigned,
                mentor_login: "m",
                student_login: "bob",
            },
            apiError: false,
            message: "success",
        });

        await onIssueCommentCreated(event!, { scm, log: noopLog });

        const wrongCmdCall = vi.mocked(scm.createIssueComment).mock.calls.find(
            (c) => c[0].body === "错误的命令",
        );
        expect(wrongCmdCall).toBeDefined();
        expect(scm.createIssueComment).toHaveBeenCalled();
    });
});
