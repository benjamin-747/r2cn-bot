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


export default (app: Probot, options: unknown) => {
    mountAtomgitWebhookIfPresent(app, options);
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
