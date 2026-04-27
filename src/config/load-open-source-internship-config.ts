import type { Logger } from "pino";

const INTERNSHIP_CONFIG_TTL_MS = 5 * 60 * 1000;

type InternshipConfig = {
    tagPrefix: string;
};

type CacheEntry = {
    value: InternshipConfig;
    expiresAt: number;
};

const cache: { entry: CacheEntry | null } = { entry: null };
const DEFAULT_INTERNSHIP_CONFIG: InternshipConfig = { tagPrefix: "r2cn" };

type RawPayload = {
    success?: boolean;
    data?: {
        tagPrefix?: unknown;
    };
};

function nowMs(): number {
    return Date.now();
}

function validCached(): InternshipConfig | null {
    const entry = cache.entry;
    if (entry == null) {
        return null;
    }
    if (entry.expiresAt <= nowMs()) {
        cache.entry = null;
        return null;
    }
    return entry.value;
}

export async function loadOpenSourceInternshipConfigFromPortal(
    log: Pick<Logger, "info" | "warn" | "error">,
): Promise<InternshipConfig | null> {
    const cached = validCached();
    if (cached != null) {
        return cached;
    }
    const portalBase = (process.env.PORTAL_ENDPOINT ?? "").trim().replace(/\/+$/, "");
    if (portalBase === "") {
        return DEFAULT_INTERNSHIP_CONFIG;
    }
    const url = `${portalBase}/api/integration/open-source-internships/config`;
    const authToken = (process.env.OPENATOM_INTEGRATION_TOKEN ?? "").trim();
    const headers: HeadersInit = authToken === "" ? {} : { Authorization: `Bearer ${authToken}` };
    try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
            log.warn({ url, status: res.status }, "portal internship config request failed");
            return DEFAULT_INTERNSHIP_CONFIG;
        }
        const payload = (await res.json()) as RawPayload;
        if (payload.success !== true) {
            log.warn({ url }, "portal internship config payload indicates failure");
            return DEFAULT_INTERNSHIP_CONFIG;
        }
        const tagPrefix = String(payload.data?.tagPrefix ?? "").trim();
        if (tagPrefix === "") {
            log.warn({ url }, "portal internship config missing tagPrefix");
            return DEFAULT_INTERNSHIP_CONFIG;
        }
        const value: InternshipConfig = { tagPrefix };
        cache.entry = {
            value,
            expiresAt: nowMs() + INTERNSHIP_CONFIG_TTL_MS,
        };
        return value;
    } catch (err) {
        log.warn({ err, url }, "portal internship config request error");
        return DEFAULT_INTERNSHIP_CONFIG;
    }
}
