import type {
    IssueCommentCreatedEvent,
    IssuesLabeledEvent,
} from "@octokit/webhooks-types";
import {
    githubIssueCommentCreatedToCanonical,
    githubIssuesLabeledToCanonical,
} from "./map-github-to-canonical.js";

/**
 * GitHub payload adapters: keep boundary logic thin and delegate canonical mapping
 * to `map-github-to-canonical` (docs §4.1, §8.5).
 */
export function adaptGithubIssuesLabeled(
    payload: IssuesLabeledEvent,
    deliveryId: string,
) {
    return githubIssuesLabeledToCanonical(payload, deliveryId);
}

export function adaptGithubIssueCommentCreated(
    payload: IssueCommentCreatedEvent,
    opts: { deliveryId: string; isBot: boolean },
) {
    return githubIssueCommentCreatedToCanonical(payload, opts);
}
