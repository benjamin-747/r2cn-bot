import type {
    Issue,
    IssueCommentCreatedEvent,
    IssuesLabeledEvent,
    Label,
    Repository,
    User,
} from "@octokit/webhooks-types";
import type { Actor, DeliveryMeta, IssueRef, LabelRef, RepoRef } from "../canonical/refs.js";
import type { IssueCommentCreated, IssueLabeled } from "../canonical/events.js";
import { normalizeDeliveryId } from "./github-webhook-log.js";

function deliveryMeta(deliveryId: string, receivedAt?: Date): DeliveryMeta {
    return {
        deliveryId: normalizeDeliveryId(deliveryId),
        ...(receivedAt !== undefined ? { receivedAt } : {}),
    };
}

export function repoRefFromGithubRepository(repository: Repository): RepoRef {
    return {
        provider: "github",
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        numericId: repository.id,
    };
}

export function issueRefFromGithubIssue(issue: Issue): IssueRef {
    return {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        htmlUrl: issue.html_url,
    };
}

export function actorFromGithubUser(user: User | null | undefined): Actor | undefined {
    if (user == null) {
        return undefined;
    }
    const a: Actor = {
        login: user.login,
        platformUserId: String(user.id),
    };
    if (user.name != null && user.name !== "") {
        a.displayName = user.name;
    }
    return a;
}

export function labelsFromGithubIssue(issue: Issue): LabelRef[] {
    return (issue.labels ?? []).map((l: Label) => ({ name: l.name }));
}

/**
 * Map GitHub `issues.labeled` payload to {@link IssueLabeled}.
 * Returns `null` if required fields are missing.
 */
export function githubIssuesLabeledToCanonical(
    payload: IssuesLabeledEvent,
    deliveryId: string,
    receivedAt?: Date,
): IssueLabeled | null {
    if (payload.action !== "labeled") {
        return null;
    }
    if (payload.label == null) {
        return null;
    }
    return {
        kind: "IssueLabeled",
        delivery: deliveryMeta(deliveryId, receivedAt),
        repo: repoRefFromGithubRepository(payload.repository),
        issue: issueRefFromGithubIssue(payload.issue),
        issueAuthor: actorFromGithubUser(payload.issue.user),
        label: { name: payload.label.name },
        labels: labelsFromGithubIssue(payload.issue),
    };
}

/**
 * Map GitHub `issue_comment.created` payload to {@link IssueCommentCreated}.
 * `isBot` is not in the payload; callers pass it from Probot `context.isBot`.
 */
export function githubIssueCommentCreatedToCanonical(
    payload: IssueCommentCreatedEvent,
    opts: { deliveryId: string; isBot: boolean; receivedAt?: Date },
): IssueCommentCreated | null {
    if (payload.action !== "created") {
        return null;
    }
    const actor = actorFromGithubUser(payload.comment.user);
    if (actor === undefined) {
        return null;
    }
    return {
        kind: "IssueCommentCreated",
        delivery: deliveryMeta(opts.deliveryId, opts.receivedAt),
        repo: repoRefFromGithubRepository(payload.repository),
        issue: issueRefFromGithubIssue(payload.issue),
        issueAuthor: actorFromGithubUser(payload.issue.user),
        issueLabels: labelsFromGithubIssue(payload.issue),
        actor,
        body: payload.comment.body ?? "",
        isBot: opts.isBot,
    };
}
