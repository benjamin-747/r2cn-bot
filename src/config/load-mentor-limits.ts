import type { Logger } from "pino";
import type { ScmProvider } from "../canonical/scm-provider.js";
import type { Maintainer } from "./index.js";

type MentorLimitsFetchResult =
    | { ok: true; maintainers: Maintainer[] }
    | { ok: false; notFound: true }
    | { ok: false; notFound: false };

type RawMentor = Record<string, unknown>;
type RawPayload = Record<string, unknown>;

function toNonNegativeInt(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return Math.trunc(value);
    }
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) {
            return Math.trunc(n);
        }
    }
    return null;
}

function toMaintainer(raw: RawMentor): Maintainer | null {
    const id = String(raw.id ?? raw.login ?? raw.mentor_login ?? "").trim();
    if (id === "") {
        return null;
    }
    const task = toNonNegativeInt(
        raw.task ?? raw.max_task ?? raw.task_limit ?? raw.limit_task ?? raw.maxConcurrentTasks,
    );
    const maxScore = toNonNegativeInt(raw.maxScore ?? raw.max_score ?? raw.score_limit ?? raw.maxTaskPoints);
    if (task == null || maxScore == null) {
        return null;
    }
    return { id, task, maxScore };
}

function normalizeMaintainers(payload: unknown): Maintainer[] {
    const container = payload as RawPayload | null;
    const nestedData =
        container?.data != null && typeof container.data === "object"
            ? (container.data as RawPayload)
            : null;
    const successFlag = container?.success;
    if (typeof successFlag === "boolean" && successFlag === false) {
        return [];
    }
    const candidates =
        Array.isArray(payload)
            ? payload
            : Array.isArray(container?.data)
                ? container?.data
                : Array.isArray(nestedData?.mentors)
                    ? nestedData?.mentors
                : Array.isArray(container?.mentors)
                    ? container?.mentors
                    : Array.isArray(container?.maintainers)
                        ? container?.maintainers
                        : Array.isArray(container?.items)
                            ? container?.items
                            : [];
    return candidates
        .map((v) => (v != null && typeof v === "object" ? toMaintainer(v as RawMentor) : null))
        .filter((m): m is Maintainer => m != null);
}

function toPortalPlatform(platform: ScmProvider): string {
    if (platform === "atomgit") {
        return "gitcode";
    }
    return platform;
}

export async function loadMentorLimitsFromPortal(
    log: Logger,
    input: {
        platform: ScmProvider;
        owner: string;
        repo: string;
    },
): Promise<MentorLimitsFetchResult> {
    const endpoint = (process.env.PORTAL_ENDPOINT ?? "").trim().replace(/\/+$/, "");
    if (endpoint === "") {
        log.error("PORTAL_ENDPOINT is empty; cannot load mentor limits");
        return { ok: false, notFound: false };
    }
    const query = new URLSearchParams({
        platform: toPortalPlatform(input.platform),
        owner: input.owner,
        repo: input.repo,
    });
    const url = `${endpoint}/api/integration/open-source-projects/mentor-limits?${query.toString()}`;
    const authToken = (process.env.OPENATOM_INTEGRATION_TOKEN ?? "").trim();
    const headers: HeadersInit = authToken === "" ? {} : { Authorization: `Bearer ${authToken}` };
    try {
        const res = await fetch(url, { headers });
        if (res.status === 404) {
            log.info({ ...input, url, status: res.status }, "portal mentor limits not found");
            return { ok: false, notFound: true };
        }
        if (!res.ok) {
            log.warn({ ...input, url, status: res.status }, "portal mentor limits request failed");
            return { ok: false, notFound: false };
        }
        const json = (await res.json()) as unknown;
        const maintainers = normalizeMaintainers(json);
        if (maintainers.length === 0) {
            log.info({ ...input, url }, "portal mentor limits empty");
            return { ok: false, notFound: true };
        }
        log.info(
            {
                ...input,
                url,
                maintainerCount: maintainers.length,
            },
            "portal mentor limits loaded",
        );
        return { ok: true, maintainers };
    } catch (err) {
        log.warn({ err, ...input, url }, "portal mentor limits request error");
        return { ok: false, notFound: false };
    }
}
