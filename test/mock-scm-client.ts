import { vi } from "vitest";
import type { ScmClient } from "../src/scm/types.js";

/**
 * In-memory {@link ScmClient} for handler unit tests (phase 1+).
 */
export function createMockScmClient(): ScmClient {
    return {
        createIssueComment: vi.fn().mockResolvedValue(undefined),
        getRepositoryContent: vi.fn().mockResolvedValue(null),
        removeLabel: vi.fn().mockResolvedValue(undefined),
        removeAssignees: vi.fn().mockResolvedValue(undefined),
        addLabels: vi.fn().mockResolvedValue(undefined),
        addAssignees: vi.fn().mockResolvedValue(undefined),
        updateIssue: vi.fn().mockResolvedValue(undefined),
        removeAllLabels: vi.fn().mockResolvedValue(undefined),
    };
}
