import yaml from "js-yaml";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "pino";
import type { BotComment } from "./index.js";

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
        return comment;
    } catch (err) {
        log.error({ err, commentFile }, "comment yaml read failed");
        return null;
    }
}
