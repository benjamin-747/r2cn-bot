import { afterEach, describe, expect, test, vi } from "vitest";
import { loadMentorLimitsFromPortal } from "../src/config/load-mentor-limits.js";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
} as any;

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PORTAL_ENDPOINT;
});

describe("loadMentorLimitsFromPortal", () => {
    test("parses portal success/data/mentors payload", async () => {
        process.env.PORTAL_ENDPOINT = "https://portal.example.com";
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        platform: "gitcode",
                        owner: "rust-lang",
                        repo: "portal",
                        total: 1,
                        mentors: [
                            {
                                login: "mock-mentor-approved-ag",
                                maxConcurrentTasks: 4,
                                maxTaskPoints: 100,
                            },
                        ],
                    },
                }),
            }),
        );

        const res = await loadMentorLimitsFromPortal(log, {
            platform: "atomgit",
            owner: "rust-lang",
            repo: "portal",
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.maintainers).toEqual([
                { id: "mock-mentor-approved-ag", task: 4, maxScore: 100 },
            ]);
        }
        const fetchMock = vi.mocked(fetch);
        expect(fetchMock.mock.calls[0]?.[0]).toContain("platform=gitcode");
    });
});
