import { describe, test, expect, vi, afterEach } from "vitest";
import type { IssueCommentCreated, IssueLabeled } from "../src/canonical/events.js";
import { dispatchCanonicalEvent } from "../src/webhooks/event-router.js";
import * as labeledMod from "../src/handlers/on-issue-labeled.js";
import * as commentMod from "../src/handlers/on-issue-comment-created.js";
import { createMockScmClient } from "./mock-scm-client.js";
import type { Logger } from "pino";

const noopLog = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => noopLog,
} as unknown as Logger;

const minimalLabeled: IssueLabeled = {
    kind: "IssueLabeled",
    delivery: { deliveryId: "d-l" },
    repo: {
        provider: "github",
        owner: "o",
        name: "r",
        fullName: "o/r",
        numericId: 1,
    },
    issue: { id: 10, number: 1, title: "t", htmlUrl: "http://x" },
    label: { name: "bug" },
    labels: [{ name: "bug" }],
};

const minimalComment: IssueCommentCreated = {
    kind: "IssueCommentCreated",
    delivery: { deliveryId: "d-c" },
    repo: {
        provider: "atomgit",
        owner: "g",
        name: "p",
        fullName: "g/p",
        numericId: 42,
    },
    issue: { id: 100, number: 3, title: "t", htmlUrl: "http://y" },
    issueLabels: [],
    actor: { login: "u" },
    body: "hi",
    isBot: false,
};

describe("dispatchCanonicalEvent (phase 5)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("routes IssueLabeled to onIssueLabeled", async () => {
        const spy = vi.spyOn(labeledMod, "onIssueLabeled").mockResolvedValue(undefined);
        const scm = createMockScmClient();
        await dispatchCanonicalEvent(minimalLabeled, { scm, log: noopLog });
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith(minimalLabeled, { scm, log: noopLog });
    });

    test("routes IssueCommentCreated to onIssueCommentCreated", async () => {
        const spy = vi.spyOn(commentMod, "onIssueCommentCreated").mockResolvedValue(undefined);
        const scm = createMockScmClient();
        await dispatchCanonicalEvent(minimalComment, { scm, log: noopLog });
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith(minimalComment, { scm, log: noopLog });
    });
});
