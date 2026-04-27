import { describe, expect, test } from "vitest";
import { isBackendApiError, isCommandApiDataSuccess } from "../src/config/index.js";

describe("isBackendApiError", () => {
    test("returns false when response has data", () => {
        expect(isBackendApiError({ data: { ok: true }, message: "" })).toBe(false);
    });

    test("returns false for 4xx responses", () => {
        expect(isBackendApiError({ data: null, message: "HTTP 404: Not Found", status: 404 })).toBe(false);
        expect(isBackendApiError({ data: null, message: "HTTP 422: Unprocessable Entity", status: 422 })).toBe(false);
    });

    test("returns true for 5xx responses", () => {
        expect(isBackendApiError({ data: null, message: "HTTP 500: Internal Server Error", status: 500 })).toBe(true);
    });

    test("returns false for empty message with null data", () => {
        expect(isBackendApiError({ data: null, message: "" })).toBe(false);
    });

    test("returns true for network error signatures", () => {
        expect(isBackendApiError({ data: null, message: "connect ECONNREFUSED 127.0.0.1:8000" })).toBe(true);
        expect(isBackendApiError({ data: null, message: "TypeError: fetch failed" })).toBe(true);
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
