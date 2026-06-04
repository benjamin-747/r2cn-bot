import yaml from "js-yaml";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "pino";
import type { BotComment } from "./index.js";

function replaceCommentTemplates(obj: unknown): unknown {
    if (typeof obj === "string") {
        return obj.replaceAll("{{INTERNSHIP_PORTAL_URL}}", process.env.INTERNSHIP_PORTAL_URL ?? "");
    }
    if (Array.isArray(obj)) {
        return obj.map(replaceCommentTemplates);
    }
    if (obj !== null && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = replaceCommentTemplates(value);
        }
        return result;
    }
    return obj;
}

export async function loadCommentConfig(
    log: Logger,
    repoFullName: string,
): Promise<BotComment | null> {
    const useEnglish = repoFullName === "rustfs/rustfs";
    const commentFile = useEnglish ? "comment.en.yaml" : "comment.zh.yaml";
    try {
        const content = await readFile(join(process.cwd(), commentFile), "utf8");
        const comment = yaml.load(content) as BotComment | null;
        if (comment == null) {
            log.error({ commentFile }, "comment yaml parsed to null");
            return null;
        }
        return replaceCommentTemplates(comment) as BotComment;
    } catch (err) {
        log.error({ err, commentFile }, "comment yaml read failed");
        return null;
    }
}
