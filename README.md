# r2cn-bot

> A GitHub App built with [Probot](https://github.com/probot/probot) that A Probot app

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Environment variables

Values below follow [docs/dual-webhook-scm-architecture.md](docs/dual-webhook-scm-architecture.md) (§6.3).

### Backend API (required)

| Variable | Description |
|----------|-------------|
| `API_ENDPOINT` | Base URL of the r2cn HTTP API (e.g. `http://r2cn-api:8000/api/v1`). |

### GitHub / Probot (required for the current GitHub App)

| Variable | Description |
|----------|-------------|
| `APP_ID` | GitHub App ID |
| `PRIVATE_KEY` | GitHub App private key (PEM) |
| `WEBHOOK_SECRET` | Webhook signing secret |
| `GITHUB_CLIENT_ID` | App OAuth client ID |
| `GITHUB_CLIENT_SECRET` | App OAuth client secret |

### Atomgit (GitLab-compatible hooks + REST; stage 4)

Configure the repository webhook URL to **`POST https://<host>:<port>/webhooks/atomgit`** (same process as Probot; path is fixed).

| Variable | Description |
|----------|-------------|
| `PORTAL_ENDPOINT` | Portal base URL. Atomgit webhook verification token is fetched by owner from `/api/integration/open-source-orgs/webhook-tokens` and cached for 5 minutes. |
| `OPENATOM_INTEGRATION_TOKEN` | Bearer token used in `Authorization` header when calling portal openatom integration APIs. |
| `ATOMGIT_API_BASE` | REST root for OpenAPI calls, e.g. `https://api.atomgit.com/api/v5`. Writes: comments `POST .../repos/:owner/:repo/issues/:number/comments`; labels `POST .../labels` (JSON **array of strings**); close/reopen issue uses `GET .../repos/:owner/:repo/issues/:number` then `PATCH .../repos/:owner/issues/:number` with **`application/x-www-form-urlencoded`** (`repo`, `title`, `body`, `state=close|reopen`) per [AtomGit](https://docs.atomgit.com/docs/apis/patch-api-v-5-repos-owner-issues-number). Required when handling Atomgit webhooks that need `AtomgitScmClient`. |
| `ATOMGIT_TOKEN` | `Authorization: Bearer` token for OpenAPI. |
| `ATOMGIT_API_VERSION` | Optional; default `2023-02-21` (`X-Api-Version` header). |

**Payload mapping** (see `src/webhooks/map-atomgit-to-canonical.ts`): `Note Hook` / `object_kind: note` on an **Issue** → `IssueCommentCreated`; **Issue Hook** → `IssueLabeled` when (1) `action: update` and `changes.labels` has **at least one** new label, or (2) **`action: open`** and labels (on `object_attributes` or top-level `issue`) already include an **`r2cn-*`** score label (create-issue-with-labels). Other events are acknowledged with **200** and a debug log (no handler).

## Docker

```sh
# 1. Build container
docker build -t r2cn-bot .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> r2cn-bot
```

## Contributing

If you have suggestions for how r2cn-bot could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2024 R2CN-DEV
