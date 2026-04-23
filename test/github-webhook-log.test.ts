import { describe, expect, test } from "vitest";
import {
    buildGithubWebhookRequestLogBindings,
    githubWebhookNameToLoggedEventType,
    normalizeDeliveryId,
} from "../src/webhooks/github-webhook-log.js";

describe("github-webhook-log (phase 0)", () => {
    test("normalizeDeliveryId uses unknown when missing", () => {
        expect(normalizeDeliveryId(undefined)).toBe("unknown");
        expect(normalizeDeliveryId(null)).toBe("unknown");
        expect(normalizeDeliveryId("")).toBe("unknown");
        expect(normalizeDeliveryId("abc")).toBe("abc");
    });

    test("githubWebhookNameToLoggedEventType maps known events", () => {
        expect(githubWebhookNameToLoggedEventType("issues.labeled")).toBe(
            "IssueLabeled",
        );
        expect(githubWebhookNameToLoggedEventType("issue_comment.created")).toBe(
            "IssueCommentCreated",
        );
        expect(githubWebhookNameToLoggedEventType("issues")).toBe("unmapped");
    });

    test("buildGithubWebhookRequestLogBindings includes repoFullName when present", () => {
        const bindings = buildGithubWebhookRequestLogBindings({
            id: "del-1",
            name: "issues.labeled",
            payload: {
                repository: { full_name: "o/r" },
            },
        });
        expect(bindings).toEqual({
            provider: "github",
            deliveryId: "del-1",
            eventType: "IssueLabeled",
            platformEvent: "issues.labeled",
            repoFullName: "o/r",
        });
    });
});
