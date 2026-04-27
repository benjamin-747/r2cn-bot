/**
 * Single place to log the text the bot is posting as an issue comment (for operator visibility).
 * Mirrors the "[api] request" style in config/index.ts.
 */
const MAX_BODY_LOG_CHARS = 4000;

export function logBotIssueReply(input: {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
}): void {
    const raw = input.body;
    const body =
        raw.length > MAX_BODY_LOG_CHARS
            ? `${raw.slice(0, MAX_BODY_LOG_CHARS)}…[truncated]`
            : raw;
    console.info("[bot] reply", {
        repo: `${input.owner}/${input.repo}`,
        issue: input.issueNumber,
        body,
    });
}
