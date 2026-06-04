/**
 * Environment variables used or reserved by this bot.
 * Probot defines many keys on NodeJS.ProcessEnv; this file adds project-specific ones.
 */
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            /** Backend HTTP API base (existing). */
            API_ENDPOINT?: string;

            /** Atomgit OpenAPI base URL (phase 4+). */
            ATOMGIT_API_BASE?: string;
            /** Atomgit API token (phase 4+). */
            ATOMGIT_TOKEN?: string;
            /** OpenAPI version header (default `2023-02-21`). */
            ATOMGIT_API_VERSION?: string;
            /** Portal server base URL for mentor limits API. */
            PORTAL_ENDPOINT?: string;
            /** Bearer token for opensource integration APIs on portal. */
            OPENSOURCE_INTEGRATION_TOKEN?: string;
            /** Portal URL for student/mentor registration (used in bot comments). */
            INTERNSHIP_PORTAL_URL?: string;
        }
    }
}

export {};
