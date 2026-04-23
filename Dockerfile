# syntax=docker/dockerfile:1

FROM node:22-slim AS builder

WORKDIR /usr/src/app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build


FROM node:22-slim AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /usr/src/app/lib ./lib
COPY comment.zh.yaml comment.en.yaml app.yml ./

# Direct probot entry (avoids `prestart` → `tsc` after devDeps were pruned)
CMD ["pnpm", "exec", "probot", "run", "./lib/index.js"]
