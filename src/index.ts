import type {
    IssueCommentCreatedEvent,
    IssuesLabeledEvent,
} from "@octokit/webhooks-types";
import type { Octokit } from "octokit";
import { Probot } from "probot";
import { buildGithubWebhookRequestLogBindings } from "./webhooks/github-webhook-log.js";
import { createScmClient } from "./scm/create-scm-client.js";
import {
    adaptGithubIssueCommentCreated,
    adaptGithubIssuesLabeled,
} from "./webhooks/github-adapter.js";
import { dispatchCanonicalEvent } from "./webhooks/event-router.js";
import { mountAtomgitWebhookIfPresent } from "./webhooks/atomgit-webhook-route.js";

let atomgitProxyStarted = false;

async function startAtomgitWebhookProxyIfConfigured(app: Probot): Promise<void> {
    const source = process.env.ATOMGIT_WEBHOOK_PROXY_URL?.trim() ?? "";
    if (source === "") {
        return;
    }
    if (atomgitProxyStarted) {
        return;
    }

    const port = process.env.PORT?.trim() || "3000";
    const host = process.env.HOST?.trim() || "localhost";
    const target = `http://${host}:${port}/webhooks/atomgit`;
    try {
        const { default: SmeeClient } = await import("smee-client");
        const smee = new SmeeClient({
            source,
            target,
            logger: {
                info: (...args: unknown[]) => app.log.info({ source, target }, String(args[0] ?? "Atomgit smee info")),
                error: (...args: unknown[]) => app.log.error({ source, target }, String(args[0] ?? "Atomgit smee error")),
            },
        });
        await smee.start();
        atomgitProxyStarted = true;
        app.log.info({ source, target }, "Atomgit smee proxy started");
    } catch (err) {
        app.log.error({ err, source, target }, "Failed to start Atomgit smee proxy");
    }
}


export default async (app: Probot, options: unknown) => {
    mountAtomgitWebhookIfPresent(app, options);
    await startAtomgitWebhookProxyIfConfigured(app);
    app.log.info(`api endpoint: ${process.env.API_ENDPOINT}`);

    app.onAny(async (event) => {
        app.log.info(
            buildGithubWebhookRequestLogBindings({
                id: event.id,
                name: event.name,
                payload: event.payload,
            }),
            "webhook received",
        );
    });

    app.on(["issues.labeled"], async (context) => {
        const payload = context.payload as IssuesLabeledEvent;
        const canonical = adaptGithubIssuesLabeled(payload, context.id);
        if (canonical == null) {
            context.log.debug("Skipping issues.labeled: could not map to canonical");
            return;
        }
        const scm = createScmClient({ provider: "github", octokit: context.octokit as unknown as Octokit });
        await dispatchCanonicalEvent(canonical, {
            scm,
            log: context.log,
            delivery: canonical.delivery,
        });
    });

    app.on(["issue_comment.created"], async (context) => {
        const payload = context.payload as IssueCommentCreatedEvent;
        const canonical = adaptGithubIssueCommentCreated(payload, {
            deliveryId: context.id,
            isBot: context.isBot,
        });
        if (canonical == null) {
            return;
        }
        const scm = createScmClient({ provider: "github", octokit: context.octokit as unknown as Octokit });
        await dispatchCanonicalEvent(canonical, {
            scm,
            log: context.log,
            delivery: canonical.delivery,
        });
    });
};
