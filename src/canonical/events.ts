import type { Actor, DeliveryMeta, IssueRef, LabelRef, RepoRef } from "./refs.js";

/**
 * Canonical event for `issues.labeled` / Issue Hook label-add flows.
 */
export type IssueLabeled = {
    kind: "IssueLabeled";
    delivery?: DeliveryMeta;
    repo: RepoRef;
    issue: IssueRef;
    /** Issue author (`issue.user`). */
    issueAuthor?: Actor;
    label: LabelRef;
    /** Full label snapshot used for multi `r2cn-*` validation. */
    labels: LabelRef[];
};

/**
 * Canonical event for `issue_comment.created` / Note Hook issue comments.
 */
export type IssueCommentCreated = {
    kind: "IssueCommentCreated";
    delivery?: DeliveryMeta;
    repo: RepoRef;
    issue: IssueRef;
    /** Issue author (`issue.user`), not the commenter. */
    issueAuthor?: Actor;
    /** Labels on the issue (e.g. `/request-release` claimed-label checks). */
    issueLabels: LabelRef[];
    actor: Actor;
    body: string;
    isBot: boolean;
};

export type CanonicalEvent = IssueLabeled | IssueCommentCreated;

export function isIssueLabeled(e: CanonicalEvent): e is IssueLabeled {
    return e.kind === "IssueLabeled";
}

export function isIssueCommentCreated(e: CanonicalEvent): e is IssueCommentCreated {
    return e.kind === "IssueCommentCreated";
}
