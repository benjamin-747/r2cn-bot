import type { Request, Response, Router } from "express";
import express from "express";
import type { Logger } from "pino";
import type { Probot } from "probot";
import { dispatchCanonicalEvent } from "./event-router.js";
import {
    atomgitWebhookMappingDiagnosis,
    atomgitWebhookToCanonical,
} from "./map-atomgit-to-canonical.js";
import { verifyAtomgitWebhookRequest } from "./atomgit-verify.js";
import { extractAtomgitDeliveryId } from "./atomgit-delivery-id.js";
import { normalizeDeliveryId } from "./github-webhook-log.js";
import { createScmClient } from "../scm/create-scm-client.js";
import type { ScmClient } from "../scm/types.js";

function atomgitEventHeader(req: Request): string {
    const h = req.headers;
    const key = Object.keys(h).find(
        (k) =>
            k.toLowerCase() === "x-atomgit-event" ||
            k.toLowerCase() === "x-gitlab-event",
    );
    if (key === undefined) {
        return "";
    }
    const v = h[key];
    return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function headerValue(
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

const MAX_REQUEST_BODY_LOG_CHARS = 64_000;

/** Log-friendly copy of the webhook JSON (truncate very large bodies). */
function requestBodyForLog(body: Record<string, unknown>): Record<string, unknown> {
    let serialized: string;
    try {
        serialized = JSON.stringify(body);
    } catch {
        return { _unserializable: true as const };
    }
    if (serialized.length <= MAX_REQUEST_BODY_LOG_CHARS) {
        return body;
    }
    return {
        _truncated: true as const,
        _jsonLength: serialized.length,
        _preview: serialized.slice(0, MAX_REQUEST_BODY_LOG_CHARS),
    };
}

/**
 * Register `POST /` on the router mounted at `/webhooks/atomgit` (docs §6、§8.6).
 */
export function registerAtomgitWebhookRoutes(
    router: Router,
    log: Logger,
): void {
    router.post(
        "/",
        express.raw({ type: ["application/json", "application/*+json"] }),
        async (req: Request, res: Response) => {
            const rawBody = Buffer.isBuffer(req.body)
                ? req.body
                : Buffer.from(
                      typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? ""),
                      "utf8",
                  );
            log.info(
                {
                    xGitcodeToken: headerValue(req.headers, "x-gitcode-token"),
                },
                "atomgit webhook headers received",
            );

            const secret = process.env.ATOMGIT_WEBHOOK_SECRET ?? "";
            if (secret === "") {
                log.warn("POST /webhooks/atomgit: ATOMGIT_WEBHOOK_SECRET unset; acknowledging to avoid retry storm");
                res.status(200).json({ ok: false, reason: "atomgit_webhook_disabled" });
                return;
            }

            const ok = verifyAtomgitWebhookRequest({
                headers: req.headers,
                secret,
                log,
            });
            if (!ok) {
                log.warn("Atomgit webhook verification failed");
                res.status(401).end("Unauthorized");
                return;
            }

            let body: Record<string, unknown>;
            try {
                body = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
            } catch {
                log.warn(
                    { rawBodyLength: rawBody.length, atomgitDecision: "invalid_json_body" },
                    "Atomgit webhook: JSON parse failed; closing 200",
                );
                res.status(200).end();
                return;
            }

            const eventHeader = atomgitEventHeader(req);
            const deliveryId = extractAtomgitDeliveryId(req.headers, body);

            const canonical = atomgitWebhookToCanonical({
                eventHeader,
                body,
                deliveryId,
            });

            const mappingDiagnosis =
                canonical == null
                    ? atomgitWebhookMappingDiagnosis({ eventHeader, body })
                    : undefined;

            log.info(
                {
                    provider: "atomgit",
                    deliveryId: normalizeDeliveryId(deliveryId),
                    eventType: canonical == null ? "ignored" : canonical.kind,
                    platformEvent: eventHeader || String(body.object_kind ?? ""),
                    repoFullName:
                        typeof (body as { project?: { path_with_namespace?: string } }).project
                            ?.path_with_namespace === "string"
                            ? (body as { project: { path_with_namespace: string } }).project
                                  .path_with_namespace
                            : undefined,
                    atomgitDecision:
                        canonical == null ? "no_canonical_event_skip_handlers" : "canonical_mapped",
                    mappingDiagnosis,
                },
                "atomgit webhook received",
            );
            log.info(
                {
                    provider: "atomgit",
                    deliveryId: normalizeDeliveryId(deliveryId),
                    requestBody: requestBodyForLog(body),
                },
                "atomgit webhook request body",
            );

            if (canonical == null) {
                res.status(200).end();
                return;
            }

            let scm: ScmClient;
            try {
                scm = createScmClient({ provider: "atomgit" });
            } catch (e) {
                log.error({ err: e }, "AtomgitScmClient init failed");
                res.status(503).json({ ok: false, reason: "atomgit_scm_misconfigured" });
                return;
            }

            const childLog = log.child({
                provider: "atomgit",
                deliveryId,
                eventType: canonical.kind,
                platformEvent: eventHeader,
            });

            childLog.info(
                {
                    atomgitDecision: "dispatch_start",
                    canonicalKind: canonical.kind,
                    repoFullName: canonical.repo.fullName,
                    issueNumber: canonical.issue.number,
                    labelName: canonical.kind === "IssueLabeled" ? canonical.label.name : undefined,
                },
                "atomgit webhook: invoking canonical handler",
            );

            try {
                await dispatchCanonicalEvent(canonical, {
                    scm,
                    log: childLog,
                    delivery: canonical.delivery,
                });
                childLog.info({ atomgitDecision: "dispatch_complete" }, "atomgit webhook: handler returned");
                res.status(200).end();
            } catch (err) {
                childLog.error({ err, atomgitDecision: "dispatch_error" }, "atomgit handler error");
                res.status(500).json({ ok: false });
            }
        },
    );
}

/**
 * Mount Atomgit webhook when `getRouter` is available (Probot server).
 */
export function mountAtomgitWebhookIfPresent(app: Probot, options: unknown): void {
    const getRouter = (options as { getRouter?: (path?: string) => Router }).getRouter;
    if (getRouter === undefined) {
        app.log.warn("getRouter unavailable: Atomgit /webhooks/atomgit not mounted");
        return;
    }
    const router = getRouter("/webhooks/atomgit");
    registerAtomgitWebhookRoutes(router, app.log);
    app.log.info("Atomgit webhook mounted at POST /webhooks/atomgit");
}
