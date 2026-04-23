/**
 * Canonical domain handlers entrypoint (no GitHub shim layer).
 * @see docs/dual-webhook-scm-architecture.md §6.1、§8.3
 */
export type { ScmHandlerDeps, WebhookRuntimeDeps } from "../scm/handler-deps.js";
export type {
    IssueLabeled,
    IssueCommentCreated,
    CanonicalEvent,
} from "../canonical/events.js";
export { onIssueLabeled } from "./on-issue-labeled.js";
export { onIssueCommentCreated } from "./on-issue-comment-created.js";
