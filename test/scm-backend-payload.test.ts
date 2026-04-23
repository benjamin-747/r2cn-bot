import { describe, expect, test } from "vitest";
import {
    mergeBackendProviderOnly,
    mergeBackendWithTask,
    scmBackendFields,
} from "../src/api/scm-backend-payload.js";

describe("scm backend payload (phase 6)", () => {
    test("scmBackendFields builds external_ref when repo + issue number present", () => {
        expect(
            scmBackendFields({
                provider: "atomgit",
                fullName: "g/p",
                issueNumber: 3,
            }),
        ).toEqual({
            scm_provider: "atomgit",
            external_ref: "atomgit:g/p#3",
        });
    });

    test("mergeBackendWithTask preserves legacy keys", () => {
        const body = mergeBackendWithTask(
            { issue_id: 7, student_login: "stu" },
            "github",
            {
                repo_id: 99,
                issue_id: 7,
                owner: "o",
                repo: "r",
                issue_number: 2,
            },
        );
        expect(body.issue_id).toBe(7);
        expect(body.scm_provider).toBe("github");
        expect(body.external_ref).toBe("github:o/r#2");
    });

    test("mergeBackendProviderOnly adds scm_provider only", () => {
        expect(mergeBackendProviderOnly({ login: "x" }, "github")).toEqual({
            login: "x",
            scm_provider: "github",
        });
    });
});
