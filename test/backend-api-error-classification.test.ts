import { describe, expect, test } from "vitest";
import { isBackendApiError, isCommandApiDataSuccess } from "../src/config/index.js";

describe("isBackendApiError", () => {
    test("returns false when response has data", () => {
        expect(isBackendApiError({ data: { ok: true }, message: "" })).toBe(false);
    });

    test("returns false for any 2xx response, even with null data", () => {
        expect(isBackendApiError({ data: null, message: "", status: 200 })).toBe(false);
        expect(isBackendApiError({ data: null, message: "", status: 204 })).toBe(false);
        expect(isBackendApiError({ data: null, message: "BUDGET_EXCEEDED: ...", status: 200 })).toBe(false);
    });

    test("returns false for 4xx responses (business/domain failures)", () => {
        expect(isBackendApiError({ data: null, message: "HTTP 404: Not Found", status: 404 })).toBe(false);
        expect(isBackendApiError({ data: null, message: "HTTP 422: Unprocessable Entity", status: 422 })).toBe(false);
    });

    test("returns true for 5xx responses", () => {
        expect(isBackendApiError({ data: null, message: "HTTP 500: Internal Server Error", status: 500 })).toBe(true);
        expect(isBackendApiError({ data: null, message: "", status: 503 })).toBe(true);
    });

    test("returns true for network error signatures without a status", () => {
        expect(isBackendApiError({ data: null, message: "connect ECONNREFUSED 127.0.0.1:8000" })).toBe(true);
        expect(isBackendApiError({ data: null, message: "TypeError: fetch failed" })).toBe(true);
        expect(isBackendApiError({ data: null, message: "getaddrinfo ENOTFOUND api.internal" })).toBe(true);
    });

    test("returns true when there is no HTTP response at all (status == null)", () => {
        expect(isBackendApiError({ data: null, message: "" })).toBe(true);
        expect(isBackendApiError({ data: null, message: "Unknown error occurred" })).toBe(true);
    });
});

describe("isCommandApiDataSuccess", () => {
    test("treats data true or non-null object as success, false or null as failure", () => {
        expect(isCommandApiDataSuccess({ data: true })).toBe(true);
        expect(isCommandApiDataSuccess({ data: { id: 1, task_status: "Finished" } })).toBe(true);
        expect(isCommandApiDataSuccess({ data: false })).toBe(false);
        expect(isCommandApiDataSuccess({ data: null })).toBe(false);
    });
});
