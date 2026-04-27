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
import { loadAtomgitWebhookTokenByOwner } from "./atomgit-webhook-token-cache.js";
import { extractAtomgitDeliveryId } from "./atomgit-delivery-id.js";
import { normalizeDeliveryId } from "./github-webhook-log.js";
import { createScmClient } from "../scm/create-scm-client.js";
import type { ScmClient } from "../scm/types.js";
import { loadCommentConfig } from "../config/load-comment-config.js";

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

function isNonCommandCommentEvent(eventHeader: string, body: Record<string, unknown>): boolean {
    const normalizedHeader = eventHeader.trim().toLowerCase();
    const objectKind = String(body.object_kind ?? "").trim().toLowerCase();
    const eventType = String(body.event_type ?? "").trim().toLowerCase();
    const action = String(body.action ?? "").trim().toLowerCase();
    const isCommentLikeEvent =
        normalizedHeader === "note" ||
        objectKind === "note" ||
        eventType === "note" ||
        action === "note";
    if (!isCommentLikeEvent) {
        return false;
    }
    const oa = body.object_attributes;
    if (oa == null || typeof oa !== "object") {
        return false;
    }
    const note = String((oa as { note?: unknown }).note ?? "").trim();
    return note !== "" && !note.startsWith("/");
}

function ownerFromAtomgitBody(body: Record<string, unknown>): string {
    const project = body.project as { path_with_namespace?: unknown; namespace?: unknown } | undefined;
    const pathWithNamespace = String(project?.path_with_namespace ?? "").trim();
    if (pathWithNamespace.includes("/")) {
        return pathWithNamespace.slice(0, pathWithNamespace.indexOf("/"));
    }
    const namespace = String(project?.namespace ?? "").trim();
    if (namespace !== "") {
        return namespace;
    }
    return "";
}

function repoNameFromAtomgitBody(body: Record<string, unknown>): string {
    const project = body.project as { path_with_namespace?: unknown; name?: unknown } | undefined;
    const pathWithNamespace = String(project?.path_with_namespace ?? "").trim();
    if (pathWithNamespace.includes("/")) {
        return pathWithNamespace.slice(pathWithNamespace.indexOf("/") + 1);
    }
    return String(project?.name ?? "").trim();
}

function issueNumberFromAtomgitBody(body: Record<string, unknown>): number | null {
    const issue = body.issue as { iid?: unknown; number?: unknown } | undefined;
    const iid = issue?.iid;
    if (typeof iid === "number" && Number.isFinite(iid)) {
        return iid;
    }
    if (typeof iid === "string" && iid.trim() !== "" && Number.isFinite(Number(iid))) {
        return Number(iid);
    }
    const number = issue?.number;
    if (typeof number === "number" && Number.isFinite(number)) {
        return number;
    }
    return null;
}

async function postSystemCommentFromBody(
    log: Logger,
    body: Record<string, unknown>,
    kind: "apiUnavailable" | "webhookTokenMismatch",
): Promise<void> {
    const owner = ownerFromAtomgitBody(body);
    const repo = repoNameFromAtomgitBody(body);
    const issueNumber = issueNumberFromAtomgitBody(body);
    if (owner === "" || repo === "" || issueNumber == null) {
        return;
    }
    const repoFullName = `${owner}/${repo}`;
    const comment = await loadCommentConfig(log, repoFullName);
    if (comment == null) {
        return;
    }
    let scm: ScmClient;
    try {
        scm = createScmClient({ provider: "atomgit" });
    } catch {
        return;
    }
    const message =
        kind === "apiUnavailable" ? comment.system.apiUnavailable : comment.system.webhookTokenMismatch;
    try {
        await scm.createIssueComment({ owner, repo, issueNumber, body: message });
    } catch (err) {
        log.warn({ err, owner, repo, issueNumber, kind }, "failed to post system comment for atomgit webhook");
    }
}

function shouldLogAtomgitRequestBody(body: Record<string, unknown>): boolean {
    const objectKind = String(body.object_kind ?? "").toLowerCase();
    if (objectKind !== "note") {
        return true;
    }
    const oa = body.object_attributes;
    if (oa == null || typeof oa !== "object") {
        return true;
    }
    const note = (oa as { note?: unknown }).note;
    if (typeof note !== "string") {
        return true;
    }
    return note.trim().startsWith("/");
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

            const owner = ownerFromAtomgitBody(body);
            const tokenResult = await loadAtomgitWebhookTokenByOwner(log, owner);
            if (!tokenResult.ok) {
                if (tokenResult.authFailed) {
                    await postSystemCommentFromBody(log, body, "apiUnavailable");
                }
                log.warn(
                    {
                        owner,
                        atomgitDecision: "webhook_token_unavailable",
                        authFailed: tokenResult.authFailed,
                    },
                    "Atomgit webhook token unavailable; acknowledging to avoid retry storm",
                );
                res.status(200).json({ ok: false, reason: "atomgit_webhook_token_unavailable" });
                return;
            }
            const ok = verifyAtomgitWebhookRequest({
                headers: req.headers,
                secret: tokenResult.token,
                log,
            });
            if (!ok) {
                await postSystemCommentFromBody(log, body, "webhookTokenMismatch");
                log.warn({ owner }, "Atomgit webhook verification failed");
                res.status(401).json({
                    ok: false,
                    reason: "atomgit_webhook_token_mismatch",
                    message: "项目注册失败，请联系管理员处理",
                });
                return;
            }

            const eventHeader = atomgitEventHeader(req);
            const deliveryId = extractAtomgitDeliveryId(req.headers, body);

            if (isNonCommandCommentEvent(eventHeader, body)) {
                res.status(200).end();
                return;
            }

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
            if (shouldLogAtomgitRequestBody(body)) {
                log.info(
                    {
                        provider: "atomgit",
                        deliveryId: normalizeDeliveryId(deliveryId),
                        requestBody: requestBodyForLog(body),
                    },
                    "atomgit webhook request body",
                );
            }

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

export function registerHealthzRoute(router: Router): void {
    router.get("/healthz", (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
    });
}

/**
 * Mount Atomgit webhook when `getRouter` is available (Probot server).
 */
export function mountAtomgitWebhookIfPresent(app: Probot, options: unknown): void {
    const getRouter = (options as { getRouter?: (path?: string) => Router }).getRouter;
    const addHandler = (
        options as {
            addHandler?: (handler: (req: Request, res: Response) => boolean | void | Promise<boolean | void>) => void;
        }
    ).addHandler;

    if (addHandler !== undefined) {
        const customApp = express();
        registerHealthzRoute(customApp);
        const atomgitRouter = express.Router();
        registerAtomgitWebhookRoutes(atomgitRouter, app.log);
        customApp.use("/webhooks/atomgit", atomgitRouter);
        try {
            addHandler((req, res) => {
                const url = req.url ?? "";
                const isHealthz = url === "/healthz" || url.startsWith("/healthz?");
                const isAtomgit = url === "/webhooks/atomgit" || url.startsWith("/webhooks/atomgit?");
                if (!isHealthz && !isAtomgit) {
                    return false;
                }
                customApp(req, res);
                return true;
            });
            app.log.info("healthz mounted at GET /healthz");
            app.log.info("Atomgit webhook mounted at POST /webhooks/atomgit");
            return;
        } catch (err) {
            app.log.warn({ err }, "addHandler unavailable at runtime; fallback to getRouter path");
        }
    }

    if (getRouter === undefined) {
        if ((process.env.PORTAL_ENDPOINT ?? "") !== "") {
            app.log.warn("getRouter unavailable: Atomgit routes (/webhooks/atomgit, /healthz) not mounted");
        } else {
            app.log.debug("getRouter unavailable and portal endpoint is unset; skipping Atomgit routes");
        }
        return;
    }
    registerHealthzRoute(getRouter());
    const router = getRouter("/webhooks/atomgit");
    registerAtomgitWebhookRoutes(router, app.log);
    app.log.info("healthz mounted at GET /healthz");
    app.log.info("Atomgit webhook mounted at POST /webhooks/atomgit");
}
