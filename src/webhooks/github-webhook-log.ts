import type { WebhookRequestLogBindings } from "../canonical/logged-event-type.js";
import type { LoggedCanonicalEventType } from "../canonical/logged-event-type.js";

/**
 * Normalize delivery id for stable log schema (docs §6.2).
 */
export function normalizeDeliveryId(raw: string | undefined | null): string {
    if (raw == null || raw === "") {
        return "unknown";
    }
    return raw;
}

export function githubWebhookNameToLoggedEventType(
    name: string,
): LoggedCanonicalEventType {
    switch (name) {
        case "issues.labeled":
            return "IssueLabeled";
        case "issue_comment.created":
            return "IssueCommentCreated";
        default:
            return "unmapped";
    }
}

function repoFullNameFromPayload(payload: unknown): string | undefined {
    if (payload === null || typeof payload !== "object") {
        return undefined;
    }
    const repo = (payload as { repository?: unknown }).repository;
    if (repo === null || typeof repo !== "object") {
        return undefined;
    }
    const fullName = (repo as { full_name?: unknown }).full_name;
    return typeof fullName === "string" ? fullName : undefined;
}

/**
 * Structured fields for GitHub (Probot) webhook logs.
 * Accepts Probot `Context` or raw `@octokit/webhooks` `EmitterWebhookEvent`.
 */
export function buildGithubWebhookRequestLogBindings(event: {
    id: string;
    name: string;
    payload: unknown;
}): WebhookRequestLogBindings {
    const repoFullName = repoFullNameFromPayload(event.payload);
    return {
        provider: "github",
        deliveryId: normalizeDeliveryId(event.id),
        eventType: githubWebhookNameToLoggedEventType(event.name),
        platformEvent: event.name,
        ...(repoFullName !== undefined ? { repoFullName } : {}),
    };
}
