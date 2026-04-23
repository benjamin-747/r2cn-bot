import yaml from "js-yaml";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "pino";
import type { ScmClient } from "../scm/types.js";
import type { ApprovedRepositoriesConfigFile, BotComment, Config } from "./index.js";

function githubConfigRepo() {
    return {
        owner: process.env.CONFIG_REPO_OWNER ?? "r2cn-dev",
        repo: process.env.CONFIG_REPO_NAME ?? "r2cn",
        ref: "main",
    };
}

async function readFromGithubConfigRepo(
    path: string,
    log: Logger,
): Promise<string | null> {
    const { owner, repo, ref } = githubConfigRepo();
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
            log.warn(
                { owner, repo, ref, path, status: res.status },
                "github config repo read failed",
            );
            return null;
        }
        const body = (await res.json()) as { content?: string; encoding?: string };
        if (body.content == null || body.encoding !== "base64") {
            log.warn({ owner, repo, ref, path }, "github config repo returned unexpected payload");
            return null;
        }
        const normalized = body.content.replace(/\n/g, "");
        return Buffer.from(normalized, "base64").toString("utf8");
    } catch (err) {
        log.warn({ err, owner, repo, ref, path }, "github config repo request error");
        return null;
    }
}

/**
 * Load `r2cn.yaml` + locale comment YAML via SCM (no Probot `Context`).
 */
export async function loadBotConfig(
    _scm: ScmClient,
    log: Logger,
    repoFullName: string,
): Promise<Config | null> {
    const r2cnFromGithub = await readFromGithubConfigRepo("r2cn.yaml", log);
    let approvedRepositories: Config["approvedRepositories"] | null = null;

    const r2cnContent = r2cnFromGithub;
    if (r2cnContent != null) {
        const parsed = yaml.load(r2cnContent) as ApprovedRepositoriesConfigFile;
        approvedRepositories = parsed.repos;
        log.info(
            {
                targetRepoFullName: repoFullName,
                approvedRepositoryCount: approvedRepositories?.length ?? 0,
                hasTargetRepository:
                    approvedRepositories?.some((r) => r.name === repoFullName) ?? false,
                configSource: "github-config-repo",
            },
            "r2cn.yaml loaded",
        );
    } else {
        log.error({ targetRepoFullName: repoFullName }, "r2cn.yaml read failed");
    }

    const useEnglish = repoFullName === "rustfs/rustfs";
    const comment_file = useEnglish ? "comment.en.yaml" : "comment.zh.yaml";

    let comment: BotComment | null = null;
    let commentReadFailed = false;
    try {
        const commentContent = await readFile(join(process.cwd(), comment_file), "utf8");
        comment = yaml.load(commentContent) as BotComment;
    } catch (err) {
        commentReadFailed = true;
        log.error({ err, commentFile: comment_file }, "comment yaml read failed");
    }
    if (!commentReadFailed && comment == null) {
        log.error({ commentFile: comment_file }, "comment yaml read failed");
    }

    if (approvedRepositories && comment) {
        return { comment, approvedRepositories };
    }
    log.error("Failed to load Config. Either approvedRepositories or comment is null.");
    return null;
}
