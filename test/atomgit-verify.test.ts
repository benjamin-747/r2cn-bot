import { describe, expect, test } from "vitest";
import pino from "pino";
import { verifyAtomgitWebhookRequest } from "../src/webhooks/atomgit-verify.js";

describe("atomgit-verify", () => {
    const log = pino({ level: "silent" });

    test("accepts matching x-gitcode-token", () => {
        const ok = verifyAtomgitWebhookRequest({
            headers: { "x-gitcode-token": "secret" },
            secret: "secret",
            log,
        });
        expect(ok).toBe(true);
    });

    test("rejects mismatched x-gitcode-token", () => {
        const ok = verifyAtomgitWebhookRequest({
            headers: { "x-gitcode-token": "wrong" },
            secret: "secret",
            log,
        });
        expect(ok).toBe(false);
    });

    test("rejects when x-gitcode-token is missing", () => {
        const ok = verifyAtomgitWebhookRequest({
            headers: {},
            secret: "secret",
            log,
        });
        expect(ok).toBe(false);
    });
});
