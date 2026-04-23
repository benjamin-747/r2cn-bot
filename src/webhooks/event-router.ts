import type { CanonicalEvent } from "../canonical/events.js";
import { isIssueCommentCreated, isIssueLabeled } from "../canonical/events.js";
import type { WebhookRuntimeDeps } from "../scm/handler-deps.js";
import { onIssueCommentCreated } from "../handlers/on-issue-comment-created.js";
import { onIssueLabeled } from "../handlers/on-issue-labeled.js";

/**
 * Dispatch a canonical event to the appropriate handler (docs §8.5).
 */
export async function dispatchCanonicalEvent(
    event: CanonicalEvent,
    deps: WebhookRuntimeDeps,
): Promise<void> {
    const { log } = deps;
    if (isIssueLabeled(event)) {
        log.info(
            {
                eventRouter: "dispatchCanonicalEvent",
                handlerDecision: "route_onIssueLabeled",
                eventKind: event.kind,
                repoFullName: event.repo.fullName,
                issueNumber: event.issue.number,
                labelName: event.label.name,
            },
            "routing IssueLabeled → onIssueLabeled",
        );
        await onIssueLabeled(event, deps);
        return;
    }
    if (isIssueCommentCreated(event)) {
        await onIssueCommentCreated(event, deps);
        return;
    }
    log.warn(
        {
            eventRouter: "dispatchCanonicalEvent",
            handlerDecision: "no_handler",
            unknownKind: (event as { kind?: string }).kind,
        },
        "canonical event not dispatched (unknown shape)",
    );
}
