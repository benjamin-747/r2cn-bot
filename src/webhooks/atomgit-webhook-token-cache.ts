import type { Logger } from "pino";

const TOKEN_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
    token: string;
    expiresAt: number;
};

const tokenCache = new Map<string, CacheEntry>();

export type AtomgitWebhookTokenLoadResult =
    | { ok: true; token: string }
    | { ok: false; authFailed: boolean };

type PortalWebhookTokenResponse = {
    success?: boolean;
    data?: {
        orgs?: Array<{
            owner?: string;
            webhookToken?: string;
        }>;
    };
};

function nowMs(): number {
    return Date.now();
}

function getValidCached(owner: string): string | null {
    const cached = tokenCache.get(owner);
    if (cached == null) {
        return null;
    }
    if (cached.expiresAt <= nowMs()) {
        tokenCache.delete(owner);
        return null;
    }
    return cached.token;
}

function cacheToken(owner: string, token: string): void {
    tokenCache.set(owner, { token, expiresAt: nowMs() + TOKEN_TTL_MS });
}

export async function loadAtomgitWebhookTokenByOwner(
    log: Logger,
    owner: string,
): Promise<AtomgitWebhookTokenLoadResult> {
    const normalizedOwner = owner.trim();
    if (normalizedOwner === "") {
        return { ok: false, authFailed: false };
    }
    const cached = getValidCached(normalizedOwner);
    if (cached != null) {
        return { ok: true, token: cached };
    }
    const portalBase = (process.env.PORTAL_ENDPOINT ?? "").trim().replace(/\/+$/, "");
    if (portalBase === "") {
        log.warn("PORTAL_ENDPOINT unset; cannot fetch atomgit webhook token");
        return { ok: false, authFailed: false };
    }
    const query = new URLSearchParams({
        platform: "atomgit",
        owner: normalizedOwner,
    });
    const url = `${portalBase}/api/integration/open-source-orgs/webhook-tokens?${query.toString()}`;
    const authToken = (process.env.OPENATOM_INTEGRATION_TOKEN ?? "").trim();
    const headers: HeadersInit = authToken === "" ? {} : { Authorization: `Bearer ${authToken}` };
    try {
        const res = await fetch(url, { headers });
        if (res.status === 401 || res.status === 403) {
            log.error(
                { owner: normalizedOwner, status: res.status, url },
                "portal webhook token auth failed; check OPENATOM_INTEGRATION_TOKEN",
            );
            return { ok: false, authFailed: true };
        }
        if (!res.ok) {
            log.warn({ owner: normalizedOwner, status: res.status, url }, "portal webhook token request failed");
            return { ok: false, authFailed: false };
        }
        const payload = (await res.json()) as PortalWebhookTokenResponse;
        if (payload.success !== true) {
            log.warn({ owner: normalizedOwner, url }, "portal webhook token payload indicates failure");
            return { ok: false, authFailed: false };
        }
        const orgs = payload.data?.orgs ?? [];
        const matched = orgs.find((o) => String(o.owner ?? "").trim() === normalizedOwner);
        const token = String(matched?.webhookToken ?? "").trim();
        if (token === "") {
            log.warn({ owner: normalizedOwner, url, orgCount: orgs.length }, "portal webhook token missing for owner");
            return { ok: false, authFailed: false };
        }
        cacheToken(normalizedOwner, token);
        return { ok: true, token };
    } catch (err) {
        log.warn({ err, owner: normalizedOwner, url }, "portal webhook token request error");
        return { ok: false, authFailed: false };
    }
}
