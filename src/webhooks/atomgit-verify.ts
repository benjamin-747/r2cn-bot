import { timingSafeEqual } from "node:crypto";
import type { Logger } from "pino";

function header(
    headers: NodeJS.Dict<string | string[] | undefined>,
    name: string,
): string | undefined {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key === undefined) {
        return undefined;
    }
    const v = headers[key];
    if (Array.isArray(v)) {
        return v[0];
    }
    return v;
}

/**
 * Verify Atomgit webhook by comparing `X-GitCode-Token` to the resolved owner token (timing-safe).
 */
export function verifyAtomgitWebhookRequest(opts: {
    headers: NodeJS.Dict<string | string[] | undefined>;
    secret: string;
    log: Logger;
}): boolean {
    const { headers, secret, log } = opts;
    const token = header(headers, "x-gitcode-token");
    if (token === undefined || secret.length === 0) {
        log.warn("Atomgit webhook: missing x-gitcode-token header or secret");
        return false;
    }
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(secret, "utf8");
    if (a.length !== b.length) {
        return false;
    }
    return timingSafeEqual(a, b);
}
