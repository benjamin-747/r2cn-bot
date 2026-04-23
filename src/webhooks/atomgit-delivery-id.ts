/**
 * Resolve a stable delivery / correlation id for Atomgit (GitLab-style) webhooks.
 * Prefer platform headers; fall back to body fields when proxies strip headers.
 */
export function extractAtomgitDeliveryId(
    headers: NodeJS.Dict<string | string[] | undefined>,
    body: Record<string, unknown>,
): string {
    const headerNames = [
        "x-gitlab-event-uuid",
        "x-atomgit-delivery",
        "x-gitcode-event-uuid",
        "x-gitcode-delivery",
        "x-gitcode-webhook-delivery",
        "x-request-id",
        "idempotency-key",
    ];
    for (const want of headerNames) {
        const key = Object.keys(headers).find((k) => k.toLowerCase() === want);
        if (key === undefined) {
            continue;
        }
        const v = headers[key];
        const s = Array.isArray(v) ? v[0] : v;
        if (typeof s === "string" && s.trim() !== "") {
            return s.trim();
        }
    }

    const uuid = body.uuid;
    if (typeof uuid === "string" && uuid.trim() !== "") {
        return uuid.trim();
    }

    const oa = body.object_attributes;
    if (oa !== null && typeof oa === "object") {
        const id = (oa as { id?: unknown }).id;
        if (typeof id === "number" && Number.isFinite(id)) {
            const kind = typeof body.object_kind === "string" ? body.object_kind : "object";
            return `${kind}-${id}`;
        }
    }

    return "unknown";
}
