import { describe, expect, test } from "vitest";
import { extractAtomgitDeliveryId } from "../src/webhooks/atomgit-delivery-id.js";

describe("extractAtomgitDeliveryId", () => {
    test("prefers x-gitlab-event-uuid", () => {
        const id = extractAtomgitDeliveryId(
            { "x-gitlab-event-uuid": "uuid-a", "x-request-id": "req-b" },
            {},
        );
        expect(id).toBe("uuid-a");
    });

    test("accepts x-gitcode-event-uuid", () => {
        const id = extractAtomgitDeliveryId({ "X-GitCode-Event-UUID": "gc-1" }, {});
        expect(id).toBe("gc-1");
    });

    test("falls back to body.uuid", () => {
        const id = extractAtomgitDeliveryId({}, { uuid: "body-uuid" });
        expect(id).toBe("body-uuid");
    });

    test("falls back to object_kind + object_attributes.id", () => {
        const id = extractAtomgitDeliveryId(
            {},
            {
                object_kind: "note",
                object_attributes: { id: 99 },
            },
        );
        expect(id).toBe("note-99");
    });

    test("returns unknown when nothing matches", () => {
        expect(extractAtomgitDeliveryId({}, {})).toBe("unknown");
    });
});
