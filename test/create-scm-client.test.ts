import { describe, expect, test } from "vitest";
import { createScmClient } from "../src/scm/create-scm-client.js";
import { GitHubScmClient } from "../src/scm/github-scm-client.js";
import { AtomgitScmClient } from "../src/scm/atomgit-scm-client.js";
import type { Octokit } from "octokit";

describe("createScmClient factory", () => {
    test("returns GitHubScmClient for provider github", () => {
        const octokit = {} as unknown as Octokit;
        const c = createScmClient({ provider: "github", octokit });
        expect(c).toBeInstanceOf(GitHubScmClient);
    });

    test("returns AtomgitScmClient for provider atomgit when env is set", () => {
        const prevBase = process.env.ATOMGIT_API_BASE;
        const prevTok = process.env.ATOMGIT_TOKEN;
        process.env.ATOMGIT_API_BASE = "https://example.com/api/v4";
        process.env.ATOMGIT_TOKEN = "test-token";
        try {
            const c = createScmClient({ provider: "atomgit" });
            expect(c).toBeInstanceOf(AtomgitScmClient);
        } finally {
            if (prevBase === undefined) {
                delete process.env.ATOMGIT_API_BASE;
            } else {
                process.env.ATOMGIT_API_BASE = prevBase;
            }
            if (prevTok === undefined) {
                delete process.env.ATOMGIT_TOKEN;
            } else {
                process.env.ATOMGIT_TOKEN = prevTok;
            }
        }
    });
});
