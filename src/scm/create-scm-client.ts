import type { Octokit } from "octokit";
import type { ScmClient } from "./types.js";
import { AtomgitScmClient } from "./atomgit-scm-client.js";
import { GitHubScmClient } from "./github-scm-client.js";

export type CreateScmClientArgs =
    | { provider: "github"; octokit: Octokit }
    | { provider: "atomgit" };

/**
 * Factory used at webhook edges to build provider-specific {@link ScmClient}
 * while keeping handlers provider-agnostic (docs §6.1).
 */
export function createScmClient(args: CreateScmClientArgs): ScmClient {
    if (args.provider === "github") {
        return new GitHubScmClient(args.octokit);
    }
    return new AtomgitScmClient();
}
