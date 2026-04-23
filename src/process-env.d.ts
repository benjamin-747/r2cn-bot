/**
 * Environment variables used or reserved by r2cn-bot.
 * Probot defines many keys on NodeJS.ProcessEnv; this file adds project-specific ones.
 */
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            /** r2cn HTTP API base (existing). */
            API_ENDPOINT?: string;

            /** Atomgit webhook verification secret (phase 4+). */
            ATOMGIT_WEBHOOK_SECRET?: string;
            /** Atomgit OpenAPI base URL (phase 4+). */
            ATOMGIT_API_BASE?: string;
            /** Atomgit API token (phase 4+). */
            ATOMGIT_TOKEN?: string;
            /** OpenAPI version header (default `2023-02-21`). */
            ATOMGIT_API_VERSION?: string;
            /** Default ref for raw file reads (`getRepositoryContent`). */
            ATOMGIT_DEFAULT_BRANCH?: string;
            /** Config repository owner (default `r2cn-dev`). */
            CONFIG_REPO_OWNER?: string;
            /** Config repository name (default `r2cn`). */
            CONFIG_REPO_NAME?: string;
        }
    }
}

export {};
