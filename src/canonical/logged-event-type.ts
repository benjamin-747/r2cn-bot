import type { ScmProvider } from "./scm-provider.js";

/**
 * Canonical event names currently emitted by webhook access logs (docs §6.2).
 * Includes routed business events and two non-routed states: `unmapped` / `ignored`.
 */
export type LoggedCanonicalEventType =
    | "IssueLabeled"
    | "IssueCommentCreated"
    | "unmapped"
    | "ignored";

/**
 * Stable structured fields attached to each webhook request log line (docs §6.2).
 */
export type WebhookRequestLogBindings = {
    provider: ScmProvider;
    /** GitHub: Probot `context.id` / X-GitHub-Delivery; missing values must be `unknown` or `none` per docs. */
    deliveryId: string;
    eventType: LoggedCanonicalEventType;
    platformEvent: string;
    repoFullName?: string;
};
