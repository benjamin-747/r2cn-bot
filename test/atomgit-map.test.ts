import { describe, expect, test } from "vitest";
import {
    atomgitIssueHookToIssueLabeled,
    atomgitNoteHookToIssueCommentCreated,
    atomgitWebhookMappingDiagnosis,
    atomgitWebhookToCanonical,
    splitPathWithNamespace,
} from "../src/webhooks/map-atomgit-to-canonical.js";

describe("map-atomgit-to-canonical", () => {
    test("splitPathWithNamespace", () => {
        expect(splitPathWithNamespace("org/repo")).toEqual({ owner: "org", name: "repo" });
        expect(splitPathWithNamespace("g/sub/p")).toEqual({ owner: "g/sub", name: "p" });
    });

    test("Note Hook on issue maps to IssueCommentCreated", () => {
        const body = {
            object_kind: "note",
            object_attributes: {
                note: "hello",
                noteable_type: "Issue",
                noteable_id: 9,
            },
            project: {
                id: 42,
                path_with_namespace: "mygroup/myproject",
            },
            issue: {
                id: 100,
                iid: 3,
                title: "T",
                web_url: "https://example.com/i/3",
                labels: [{ title: "a" }],
                author: { username: "author", id: 1 },
            },
            user: { username: "commenter", id: 2 },
        };
        const ev = atomgitNoteHookToIssueCommentCreated(body, "d1");
        expect(ev).not.toBeNull();
        expect(ev!.kind).toBe("IssueCommentCreated");
        expect(ev!.repo.provider).toBe("atomgit");
        expect(ev!.repo.numericId).toBe(42);
        expect(ev!.issue.number).toBe(3);
        expect(ev!.body).toBe("hello");
        expect(ev!.actor.login).toBe("commenter");
        expect(ev!.issueLabels).toEqual([{ name: "a" }]);
    });

    test("atomgitWebhookToCanonical delegates Note Hook", () => {
        const body = {
            object_kind: "note",
            object_attributes: {
                note: "x",
                noteable_type: "Issue",
            },
            project: { id: 1, path_with_namespace: "a/b" },
            issue: {
                id: 1,
                iid: 1,
                title: "t",
                web_url: "u",
                labels: [],
                author: { username: "a", id: 1 },
            },
            user: { username: "u", id: 2 },
        };
        const ev = atomgitWebhookToCanonical({
            eventHeader: "Note Hook",
            body,
            deliveryId: "x",
        });
        expect(ev).not.toBeNull();
    });

    test("atomgitWebhookMappingDiagnosis explains unrelated object_kind", () => {
        const d = atomgitWebhookMappingDiagnosis({
            eventHeader: "",
            body: { object_kind: "push" },
        });
        expect(d.reason).toBe("object_kind_not_note_or_issue");
    });

    test("atomgitWebhookMappingDiagnosis explains issue open without score labels", () => {
        const d = atomgitWebhookMappingDiagnosis({
            eventHeader: "",
            body: {
                object_kind: "issue",
                object_attributes: { action: "open", id: 1, iid: 1, title: "t" },
            },
        });
        expect(d.reason).toBe("issue_open_no_score_labels");
    });

    test("Issue Hook open with openatom-* on object_attributes maps to IssueLabeled", () => {
        const body = {
            object_kind: "issue",
            project: { id: 1, path_with_namespace: "g/p" },
            object_attributes: {
                action: "open",
                id: 500,
                iid: 1,
                title: "new",
                web_url: "https://x",
                author: { username: "mentor", id: 1 },
                labels: [{ title: "bug" }, { title: "openatom-15" }],
            },
        };
        const ev = atomgitIssueHookToIssueLabeled(body, "d-open");
        expect(ev).not.toBeNull();
        expect(ev!.kind).toBe("IssueLabeled");
        expect(ev!.label.name).toBe("openatom-15");
    });

    test("Issue Hook open reads labels from top-level issue when object_attributes.labels empty", () => {
        const body = {
            object_kind: "issue",
            project: { id: 1, path_with_namespace: "g/p" },
            object_attributes: {
                action: "open",
                id: 500,
                iid: 1,
                title: "new",
                web_url: "https://x",
                author: { username: "mentor", id: 1 },
                labels: [],
            },
            issue: {
                id: 500,
                iid: 1,
                labels: [{ title: "openatom-8" }],
            },
        };
        const ev = atomgitIssueHookToIssueLabeled(body, "d-open2");
        expect(ev).not.toBeNull();
        expect(ev!.label.name).toBe("openatom-8");
    });

    test("Issue Hook open reads labels from root body.labels (GitCode)", () => {
        const body = {
            object_kind: "issue",
            project: { id: 1, path_with_namespace: "g/p" },
            object_attributes: {
                action: "open",
                id: 500,
                iid: 4,
                title: "t",
                web_url: "https://x",
                author: { username: "u", id: 1 },
            },
            labels: [{ title: "openatom" }, { title: "openatom-20" }],
        };
        const ev = atomgitIssueHookToIssueLabeled(body, "d-open-root");
        expect(ev).not.toBeNull();
        expect(ev!.label.name).toBe("openatom-20");
    });

    test("Issue Hook open reads labels from changes.labels.current when others empty", () => {
        const body = {
            object_kind: "issue",
            project: { id: 1, path_with_namespace: "g/p" },
            object_attributes: {
                action: "open",
                id: 500,
                iid: 4,
                title: "t",
                author: { username: "u", id: 1 },
            },
            changes: {
                labels: {
                    previous: [],
                    current: [{ title: "openatom-5" }],
                },
            },
        };
        const ev = atomgitIssueHookToIssueLabeled(body, "d-open-ch");
        expect(ev).not.toBeNull();
        expect(ev!.label.name).toBe("openatom-5");
    });

    test("Issue Hook with multiple labels added maps; primary label is first openatom-* in added order", () => {
        const body = {
            object_kind: "issue",
            project: { id: 99, path_with_namespace: "g/p" },
            object_attributes: {
                action: "update",
                id: 500,
                iid: 2,
                title: "t",
                web_url: "https://x",
                author: { username: "mentor", id: 1 },
                labels: [
                    { title: "bug" },
                    { title: "openatom-10" },
                    { title: "openatom-20" },
                ],
            },
            changes: {
                labels: {
                    previous: [{ title: "bug" }],
                    current: [
                        { title: "bug" },
                        { title: "openatom-10" },
                        { title: "openatom-20" },
                    ],
                },
            },
        };
        const ev = atomgitIssueHookToIssueLabeled(body, "d-multi");
        expect(ev).not.toBeNull();
        expect(ev!.kind).toBe("IssueLabeled");
        expect(ev!.label.name).toBe("openatom-10");
        expect(ev!.labels.map((l) => l.name)).toEqual(["bug", "openatom-10", "openatom-20"]);
    });

    test("atomgitWebhookMappingDiagnosis for multiple added uses zero_added only when diff empty", () => {
        const body = {
            object_kind: "issue",
            object_attributes: {
                action: "update",
                id: 1,
                iid: 1,
                title: "t",
                author: { username: "u", id: 1 },
                labels: [],
            },
            changes: {
                labels: {
                    previous: [{ title: "a" }],
                    current: [{ title: "a" }],
                },
            },
            project: { id: 1, path_with_namespace: "o/r" },
        };
        const d = atomgitWebhookMappingDiagnosis({ eventHeader: "", body });
        expect(d.reason).toBe("issue_labels_zero_added");
    });
});
