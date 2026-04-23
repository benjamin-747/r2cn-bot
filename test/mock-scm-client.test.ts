import { describe, expect, test } from "vitest";
import type { ScmHandlerDeps } from "../src/scm/handler-deps.js";
import type { Config } from "../src/config/index.js";
import { createMockScmClient } from "./mock-scm-client.js";

describe("createMockScmClient (phase 1)", () => {
    test("implements ScmClient for ScmHandlerDeps typing", async () => {
        const scm = createMockScmClient();
        const config = { comment: {}, r2cn: { repos: [] } } as unknown as Config;
        const deps: ScmHandlerDeps = {
            scm,
            config,
            log: { info: () => {}, error: () => {}, debug: () => {} } as ScmHandlerDeps["log"],
        };

        await deps.scm.createIssueComment({
            owner: "o",
            repo: "r",
            issueNumber: 1,
            body: "hi",
        });
        expect(scm.createIssueComment).toHaveBeenCalledTimes(1);
    });
});
