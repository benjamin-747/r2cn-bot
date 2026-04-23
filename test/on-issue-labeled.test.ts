import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IssuesLabeledEvent } from "@octokit/webhooks-types";
import { describe, expect, test } from "vitest";
import { githubIssuesLabeledToCanonical } from "../src/webhooks/map-github-to-canonical.js";
import { onIssueLabeled } from "../src/handlers/on-issue-labeled.js";
import { createMockScmClient } from "./mock-scm-client.js";
import type { Logger } from "pino";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("onIssueLabeled (phase 3)", () => {
    test("skips non-r2cn labels without calling SCM", async () => {
        const raw = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, "fixtures/issues.labeled-non-r2cn.json"),
                "utf-8",
            ),
        );
        const event = githubIssuesLabeledToCanonical(
            raw as unknown as IssuesLabeledEvent,
            "d1",
        );
        expect(event).not.toBeNull();

        const scm = createMockScmClient();
        const log = { debug: () => {}, error: () => {}, info: () => {} } as unknown as Logger;

        await onIssueLabeled(event!, { scm, log });

        expect(scm.createIssueComment).not.toHaveBeenCalled();
        expect(scm.getRepositoryContent).not.toHaveBeenCalled();
    });
});
