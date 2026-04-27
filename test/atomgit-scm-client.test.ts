import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("AtomgitScmClient createIssueComment", () => {
    beforeEach(() => {
        process.env.ATOMGIT_API_BASE = "https://api.atomgit.com/api/v5";
        process.env.ATOMGIT_TOKEN = "test-token";
    });

    afterEach(() => {
        delete process.env.ATOMGIT_API_BASE;
        delete process.env.ATOMGIT_TOKEN;
        vi.restoreAllMocks();
    });

    test("POSTs to v5 /repos/:owner/:repo/issues/:number/comments", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));

        const { AtomgitScmClient } = await import("../src/scm/atomgit-scm-client.js");
        const client = new AtomgitScmClient();
        await client.createIssueComment({
            owner: "rust-lang",
            repo: "portal",
            issueNumber: 3,
            body: "hi",
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            "https://api.atomgit.com/api/v5/repos/rust-lang/portal/issues/3/comments",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ body: "hi" }),
            }),
        );
    });

    test("POSTs addLabels to v5 /repos/:owner/:repo/issues/:number/labels", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

        const { AtomgitScmClient } = await import("../src/scm/atomgit-scm-client.js");
        const client = new AtomgitScmClient();
        await client.addLabels({
            owner: "rust-lang",
            repo: "portal",
            issueNumber: 3,
            labels: ["openatom", "claimed"],
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            "https://api.atomgit.com/api/v5/repos/rust-lang/portal/issues/3/labels",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify(["openatom", "claimed"]),
            }),
        );
    });

    test("updateIssue GETs issue then PATCHes with form (repo, title, state)", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            const u = String(url);
            const method = (init as { method?: string } | undefined)?.method ?? "GET";
            if (u.includes("/repos/rust-lang/portal/issues/1") && method === "GET") {
                return new Response(JSON.stringify({ title: "Issue title", body: "" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (u.endsWith("/repos/rust-lang/issues/1") && (init as { method?: string })?.method === "PATCH") {
                return new Response(null, { status: 200 });
            }
            return new Response("unexpected url", { status: 500 });
        });

        const { AtomgitScmClient } = await import("../src/scm/atomgit-scm-client.js");
        const client = new AtomgitScmClient();
        await client.updateIssue({
            owner: "rust-lang",
            repo: "portal",
            issueNumber: 1,
            state: "closed",
        });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchSpy).toHaveBeenNthCalledWith(
            1,
            "https://api.atomgit.com/api/v5/repos/rust-lang/portal/issues/1",
            expect.objectContaining({ method: "GET" }),
        );
        const expectedForm =
            "repo=portal&title=Issue+title&body=+&state=close";
        expect(fetchSpy).toHaveBeenNthCalledWith(
            2,
            "https://api.atomgit.com/api/v5/repos/rust-lang/issues/1",
            expect.objectContaining({
                method: "PATCH",
                headers: expect.objectContaining({
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                }),
                body: expectedForm,
            }),
        );
    });

    test("addLabels no-ops when labels array is empty", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

        const { AtomgitScmClient } = await import("../src/scm/atomgit-scm-client.js");
        const client = new AtomgitScmClient();
        await client.addLabels({
            owner: "rust-lang",
            repo: "portal",
            issueNumber: 3,
            labels: [],
        });

        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
