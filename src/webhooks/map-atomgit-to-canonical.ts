import type { Actor, LabelRef, RepoRef } from "../canonical/refs.js";
import type { IssueCommentCreated, IssueLabeled } from "../canonical/events.js";
import { normalizeDeliveryId } from "./github-webhook-log.js";

/**
 * Split GitLab `path_with_namespace` into owner (namespace) and project short name.
 */
export function splitPathWithNamespace(pathWithNamespace: string): {
    owner: string;
    name: string;
} {
    const i = pathWithNamespace.lastIndexOf("/");
    if (i === -1) {
        return { owner: pathWithNamespace, name: pathWithNamespace };
    }
    return {
        owner: pathWithNamespace.slice(0, i),
        name: pathWithNamespace.slice(i + 1),
    };
}

function actorFromGitlabUser(u: unknown): Actor | undefined {
    if (u === null || typeof u !== "object") {
        return undefined;
    }
    const o = u as Record<string, unknown>;
    const login =
        (typeof o.username === "string" && o.username) ||
        (typeof o.login === "string" && o.login) ||
        "";
    if (login === "") {
        return undefined;
    }
    const id = o.id;
    const name = typeof o.name === "string" ? o.name : undefined;
    const a: Actor = {
        login,
        platformUserId: typeof id === "number" ? String(id) : undefined,
    };
    if (name != null && name !== "") {
        a.displayName = name;
    }
    return a;
}

/**
 * When GitCode / GitLab sends **multiple new labels** in one `changes.labels` diff,
 * pick one {@link LabelRef} for {@link IssueLabeled.label}: first score-like label
 * (`*-<number>`, excluding `*-complete`) if present, otherwise first added label.
 */
function primaryAddedLabelForIssueHook(added: LabelRef[]): LabelRef | undefined {
    if (added.length === 0) {
        return undefined;
    }
    const scoreLike = added.find((l) => /.+-\d+$/.test(l.name) && !l.name.endsWith("-complete"));
    return scoreLike ?? added[0];
}

function labelTitles(labels: unknown): LabelRef[] {
    if (!Array.isArray(labels)) {
        return [];
    }
    const out: LabelRef[] = [];
    for (const l of labels) {
        if (l && typeof l === "object") {
            const t = (l as { title?: string; name?: string }).title ?? (l as { name?: string }).name;
            if (typeof t === "string") {
                out.push({ name: t });
            }
        }
    }
    return out;
}

/**
 * Labels on Issue Hook (GitCode varies by event):
 * `object_attributes.labels` → top-level `issue.labels` → top-level **`labels`**
 * → `changes.labels.current` (common on **`action: open`** create).
 */
function issueHookLabelSnapshot(body: Record<string, unknown>, oa: Record<string, unknown>): LabelRef[] {
    const fromOa = labelTitles(oa.labels);
    if (fromOa.length > 0) {
        return fromOa;
    }
    const issue = body.issue;
    if (issue !== null && typeof issue === "object") {
        const fromIssue = labelTitles((issue as Record<string, unknown>).labels);
        if (fromIssue.length > 0) {
            return fromIssue;
        }
    }
    const fromRoot = labelTitles(body.labels);
    if (fromRoot.length > 0) {
        return fromRoot;
    }
    const changes = body.changes;
    if (changes !== null && typeof changes === "object") {
        const chLabels = (changes as Record<string, unknown>).labels;
        if (chLabels !== null && typeof chLabels === "object") {
            const fromChanges = labelTitles((chLabels as { current?: unknown }).current);
            if (fromChanges.length > 0) {
                return fromChanges;
            }
        }
    }
    return [];
}

function projectFromBody(body: Record<string, unknown>): {
    id: number;
    pathWithNamespace: string;
} | null {
    const project = body.project ?? body.repository;
    if (project === null || typeof project !== "object") {
        return null;
    }
    const p = project as Record<string, unknown>;
    const id = p.id;
    const pathWithNamespace =
        (typeof p.path_with_namespace === "string" && p.path_with_namespace) ||
        (typeof p.full_name === "string" && p.full_name) ||
        "";
    if (typeof id !== "number" || pathWithNamespace === "") {
        return null;
    }
    return { id, pathWithNamespace };
}

/**
 * GitLab / Atomgit **Note Hook** on an issue → {@link IssueCommentCreated}.
 */
export function atomgitNoteHookToIssueCommentCreated(
    body: Record<string, unknown>,
    deliveryId: string,
): IssueCommentCreated | null {
    if (body.object_kind !== "note") {
        return null;
    }
    const attrs = body.object_attributes;
    if (attrs === null || typeof attrs !== "object") {
        return null;
    }
    const a = attrs as Record<string, unknown>;
    const noteableType = typeof a.noteable_type === "string" ? a.noteable_type : "";
    if (noteableType.toLowerCase() !== "issue") {
        return null;
    }

    const project = projectFromBody(body);
    if (project == null) {
        return null;
    }
    const { owner, name } = splitPathWithNamespace(project.pathWithNamespace);
    const repo: RepoRef = {
        provider: "atomgit",
        owner,
        name,
        fullName: project.pathWithNamespace,
        numericId: project.id,
    };

    const issueObj = body.issue;
    if (issueObj === null || typeof issueObj !== "object") {
        return null;
    }
    const issue = issueObj as Record<string, unknown>;
    const iid = issue.iid;
    const internalId = issue.id;
    const title = typeof issue.title === "string" ? issue.title : "";
    const webUrl = typeof issue.web_url === "string" ? issue.web_url : "";
    if (typeof iid !== "number" || typeof internalId !== "number") {
        return null;
    }

    const issueRef = {
        id: internalId,
        number: iid,
        title,
        htmlUrl: webUrl,
    };

    const actor = actorFromGitlabUser(body.user);
    if (actor === undefined) {
        return null;
    }

    const note = typeof a.note === "string" ? a.note : "";
    const userType =
        typeof (body.user as Record<string, unknown> | undefined)?.type === "string"
            ? String((body.user as Record<string, unknown>).type).toLowerCase()
            : "";
    const isBot = userType === "bot" || actor.login.endsWith("[bot]");

    return {
        kind: "IssueCommentCreated",
        delivery: { deliveryId: normalizeDeliveryId(deliveryId) },
        repo,
        issue: issueRef,
        issueAuthor: actorFromGitlabUser(issue.author),
        issueLabels: labelTitles(issue.labels),
        actor,
        body: note,
        isBot,
    };
}

/**
 * GitLab / Atomgit **Issue Hook** → {@link IssueLabeled} when:
 * - **`action: update`** and `changes.labels` shows **at least one** new label; or
 * - **`action: open`** and `object_attributes.labels` already contains score-like labels
 *   (GitCode may not emit a separate `update` hook when creating an issue with labels).
 */
export function atomgitIssueHookToIssueLabeled(
    body: Record<string, unknown>,
    deliveryId: string,
): IssueLabeled | null {
    if (body.object_kind !== "issue") {
        return null;
    }
    const attrs = body.object_attributes;
    if (attrs === null || typeof attrs !== "object") {
        return null;
    }
    const oa = attrs as Record<string, unknown>;
    const action = oa.action;

    let newLabel: LabelRef;
    if (action === "update") {
        const changes = body.changes;
        if (changes === null || typeof changes !== "object") {
            return null;
        }
        const chLabels = (changes as Record<string, unknown>).labels;
        if (chLabels === null || typeof chLabels !== "object") {
            return null;
        }
        const cl = chLabels as { previous?: unknown; current?: unknown };
        const prev = new Set(
            labelTitles(cl.previous).map((x) => x.name),
        );
        const current = labelTitles(cl.current);
        const added = current.filter((l) => !prev.has(l.name));
        if (added.length === 0) {
            return null;
        }
        const picked = primaryAddedLabelForIssueHook(added);
        if (picked === undefined) {
            return null;
        }
        newLabel = picked;
    } else if (action === "open") {
        const labelsOnIssue = issueHookLabelSnapshot(body, oa);
        const scoreLike = labelsOnIssue.filter((l) => /.+-\d+$/.test(l.name) && !l.name.endsWith("-complete"));
        if (scoreLike.length === 0) {
            return null;
        }
        const picked = primaryAddedLabelForIssueHook(scoreLike);
        if (picked === undefined) {
            return null;
        }
        newLabel = picked;
    } else {
        return null;
    }

    const project = projectFromBody(body);
    if (project == null) {
        return null;
    }
    const { owner, name } = splitPathWithNamespace(project.pathWithNamespace);
    const repo: RepoRef = {
        provider: "atomgit",
        owner,
        name,
        fullName: project.pathWithNamespace,
        numericId: project.id,
    };

    const internalId = oa.id;
    const iid = oa.iid;
    const title = typeof oa.title === "string" ? oa.title : "";
    const webUrl =
        (typeof oa.web_url === "string" && oa.web_url) ||
        (typeof oa.url === "string" && oa.url) ||
        "";
    if (typeof internalId !== "number" || typeof iid !== "number") {
        return null;
    }

    const labels = issueHookLabelSnapshot(body, oa);

    return {
        kind: "IssueLabeled",
        delivery: { deliveryId: normalizeDeliveryId(deliveryId) },
        repo,
        issue: {
            id: internalId,
            number: iid,
            title,
            htmlUrl: webUrl || `https://example.invalid/issue/${iid}`,
        },
        issueAuthor: actorFromGitlabUser(oa.author),
        label: newLabel,
        labels: labels.length > 0 ? labels : [newLabel],
    };
}

/**
 * Map `X-AtomGit-Event` / `X-Gitlab-Event` + JSON body to a canonical event, or `null` if unmapped.
 */
export function atomgitWebhookToCanonical(opts: {
    eventHeader: string;
    body: Record<string, unknown>;
    deliveryId: string;
}): IssueLabeled | IssueCommentCreated | null {
    const h = opts.eventHeader.trim();
    const { body, deliveryId } = opts;

    if (h === "Note Hook" || body.object_kind === "note") {
        return atomgitNoteHookToIssueCommentCreated(body, deliveryId);
    }
    if (h === "Issue Hook" || body.object_kind === "issue") {
        const labeled = atomgitIssueHookToIssueLabeled(body, deliveryId);
        if (labeled != null) {
            return labeled;
        }
    }
    return null;
}

/**
 * When {@link atomgitWebhookToCanonical} returns `null`, explains which branch ran and the first failed expectation.
 */
export function atomgitWebhookMappingDiagnosis(opts: {
    eventHeader: string;
    body: Record<string, unknown>;
}): { reason: string; details: Record<string, unknown> } {
    const { eventHeader, body } = opts;
    const h = eventHeader.trim();
    const kind = body.object_kind;
    const base: Record<string, unknown> = {
        platformEventHeader: h === "" ? "(empty)" : h,
        object_kind: kind,
    };

    if (h === "Note Hook" || kind === "note") {
        if (kind !== "note") {
            return {
                reason: "note_branch_object_kind_mismatch",
                details: { ...base, expectedObjectKind: "note" },
            };
        }
        const attrs = body.object_attributes;
        if (attrs === null || typeof attrs !== "object") {
            return { reason: "note_missing_object_attributes", details: base };
        }
        const a = attrs as Record<string, unknown>;
        const noteableType = typeof a.noteable_type === "string" ? a.noteable_type : "";
        if (noteableType.toLowerCase() !== "issue") {
            return {
                reason: "note_not_on_issue",
                details: { ...base, noteableType: noteableType || "(empty)" },
            };
        }
        if (projectFromBody(body) == null) {
            return { reason: "note_missing_project_or_path", details: base };
        }
        const issueObj = body.issue;
        if (issueObj === null || typeof issueObj !== "object") {
            return { reason: "note_missing_top_level_issue", details: base };
        }
        const issue = issueObj as Record<string, unknown>;
        if (typeof issue.iid !== "number" || typeof issue.id !== "number") {
            return {
                reason: "note_issue_missing_numeric_iid_or_id",
                details: { ...base, iid: issue.iid, id: issue.id },
            };
        }
        if (actorFromGitlabUser(body.user) === undefined) {
            return { reason: "note_user_missing_login", details: base };
        }
        return { reason: "note_mapper_returned_null_unknown", details: base };
    }

    if (h === "Issue Hook" || kind === "issue") {
        if (kind !== "issue") {
            return {
                reason: "issue_branch_object_kind_mismatch",
                details: { ...base, expectedObjectKind: "issue" },
            };
        }
        const attrs = body.object_attributes;
        if (attrs === null || typeof attrs !== "object") {
            return { reason: "issue_missing_object_attributes", details: base };
        }
        const oa = attrs as Record<string, unknown>;
        const action = oa.action;

        if (action === "open") {
            const labelsOnIssue = issueHookLabelSnapshot(body, oa);
            const scoreLike = labelsOnIssue.filter((l) => /.+-\d+$/.test(l.name) && !l.name.endsWith("-complete"));
            if (scoreLike.length === 0) {
                return {
                    reason: "issue_open_no_score_labels",
                    details: {
                        ...base,
                        action,
                        labelNamesOnIssue: labelsOnIssue.map((l) => l.name),
                    },
                };
            }
            if (projectFromBody(body) == null) {
                return { reason: "issue_missing_project_or_path", details: base };
            }
            if (typeof oa.id !== "number" || typeof oa.iid !== "number") {
                return {
                    reason: "issue_missing_numeric_id_or_iid",
                    details: { ...base, id: oa.id, iid: oa.iid },
                };
            }
            return { reason: "issue_labeled_mapper_returned_null_unknown", details: base };
        }

        if (action !== "update") {
            return {
                reason: "issue_hook_unsupported_action",
                details: { ...base, action },
            };
        }
        const changes = body.changes;
        if (changes === null || typeof changes !== "object") {
            return { reason: "issue_missing_changes", details: base };
        }
        const chLabels = (changes as Record<string, unknown>).labels;
        if (chLabels === null || typeof chLabels !== "object") {
            return { reason: "issue_changes_missing_labels", details: base };
        }
        const cl = chLabels as { previous?: unknown; current?: unknown };
        const prev = new Set(labelTitles(cl.previous).map((x) => x.name));
        const current = labelTitles(cl.current);
        const added = current.filter((l) => !prev.has(l.name));
        if (added.length === 0) {
            return {
                reason: "issue_labels_zero_added",
                details: {
                    ...base,
                    addedCount: 0,
                    addedLabelNames: [],
                },
            };
        }
        if (projectFromBody(body) == null) {
            return { reason: "issue_missing_project_or_path", details: base };
        }
        if (typeof oa.id !== "number" || typeof oa.iid !== "number") {
            return {
                reason: "issue_missing_numeric_id_or_iid",
                details: { ...base, id: oa.id, iid: oa.iid },
            };
        }
        return { reason: "issue_labeled_mapper_returned_null_unknown", details: base };
    }

    return {
        reason: "object_kind_not_note_or_issue",
        details: {
            ...base,
            enteredNoteBranch: h === "Note Hook" || kind === "note",
            enteredIssueBranch: h === "Issue Hook" || kind === "issue",
        },
    };
}
