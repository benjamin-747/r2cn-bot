# Dual Webhook 重构阶段明细（归档）

本文为 `docs/dual-webhook-scm-architecture.md` 第 8 章详细内容归档，保留分阶段目标、动作、验收与落地锚点，便于复盘与审计。

## 8. 重构的步骤（原文归档）

总体顺序与第 1～7 节一致：**先模型与 GitHub 路径收口，再挂第二平台，最后补测试与 API 契约**。下列阶段可对应多个独立 PR，便于评审与回滚。

### 8.1 阶段概览

| 阶段 | 主题 | 核心产出 |
|------|------|----------|
| 0 | 准备 | 目录约定、日志字段约定、环境变量清单对齐运维 |
| 1 | 模型与接口 | Canonical 类型、`ScmClient`、`ScmContext`（或等价 deps） |
| 2 | GitHub SCM 实现 | `GitHubScmClient` + 现有 Octokit 调用迁入 |
| 3 | Router + Handler 抽取 | `issues.labeled` / `issue_comment.created` 与 Probot 解耦 |
| 4 | Atomgit 接入 | 路由、`atomgit.adapter`、`AtomgitScmClient` |
| 5 | 测试与回归 | 双平台 fixture、handler 单测、关键路径集成验证 |
| 6 |（可选）API 契约 | 后端 `scm_provider` / `external_ref` 等与第 7 节联动 |

### 8.2 阶段 0：准备

- **目标**：减少后续大范围改动时的返工。
- **建议动作**：落实 **第 6.1 节** 目录约定、**第 6.2 节** 日志字段约定、**第 6.3 节** 环境变量清单，并与运维 / CI（如 [`.github/workflows/bot-deploy.yml`](../../.github/workflows/bot-deploy.yml)）对齐。
- **验收**：文档与部署配置可查；团队对「先 GitHub 收口、再 Atomgit」顺序无异议。

**代码库已落实（阶段 0）**：`src/canonical/`、`src/config/`（原 `common.ts`）、`src/webhooks/`（含 `github-webhook-log`）、`src/scm/`、`src/handlers/` 占位；[`src/index.ts`](../../src/index.ts) 通过 `app.onAny` 打结构化 `webhook received` 日志（`provider`、`deliveryId`、`eventType`、`platformEvent`、`repoFullName`）；[`README.md`](../../README.md) 与部署 workflow 已补充环境变量说明；[`src/process-env.d.ts`](../../src/process-env.d.ts) 声明 Atomgit 相关键。

### 8.3 阶段 1：Canonical + `ScmClient` + `ScmContext`

- **目标**：业务依赖的「输入」与「写回 SCM 的能力」有稳定类型，不引用 Probot `Context`。
- **主要动作**：
  - 定义 `RepoRef`、`Actor`、`IssueRef`、`IssueLabeled`、`IssueCommentCreated` 等（命名可按实现微调）。
  - 定义 `ScmClient` 最小方法集（如 `createIssueComment`；后续按需加 `removeLabel`、`removeAssignees`、`getIssue` 等）。
  - 定义 handler 依赖对象：`ScmClient`、`Config`、结构化 `log`、可选 `deliveryId`（幂等或排障）。
- **验收**：类型可在不跑 Probot 的情况下被 TypeScript 编译引用；不实现具体平台逻辑也可编写针对 handler 的单元测试骨架。

**代码库已落实（阶段 1）**：[`src/canonical/refs.ts`](../../src/canonical/refs.ts)、[`src/canonical/events.ts`](../../src/canonical/events.ts)；[`src/scm/types.ts`](../../src/scm/types.ts)（`ScmClient` 含评论、标签、assignee、关 issue、读仓库文件等签名）、[`src/scm/handler-deps.ts`](../../src/scm/handler-deps.ts)（`ScmHandlerDeps`）；[`src/webhooks/map-github-to-canonical.ts`](../../src/webhooks/map-github-to-canonical.ts) 将 GitHub `IssuesLabeledEvent` / `IssueCommentCreatedEvent` 映射为 Canonical；单测见 [`test/github-to-canonical.test.ts`](../../test/github-to-canonical.test.ts)、[`test/mock-scm-client.ts`](../../test/mock-scm-client.ts)。

### 8.4 阶段 2：`GitHubScmClient` 与 Octokit 收敛

- **目标**：所有「对 GitHub 写操作」从 `index.ts`、`src/student/`、`src/mentor/` 等散落的 `context.octokit` 迁入 **`GitHubScmClient`**。
- **主要动作**：按调用点逐个替换为接口方法；内部仍可用 Octokit 或 REST，对上层隐藏。
- **验收**：业务文件不再直接依赖 `context.octokit`（配置拉取若暂留 GitHub 专用路径，可单独标注为后续 `ConfigLoader` 抽象项）。

**代码库已落实（阶段 2）**：[`src/scm/github-scm-client.ts`](../../src/scm/github-scm-client.ts) 实现 `ScmClient`（封装 Probot 安装态 `octokit`）；YAML 配置读取经 `getRepositoryContent`（阶段 3 起由 [`loadBotConfig`](../../src/config/load-bot-config.ts) 统一封装）；[`src/student/index.ts`](../../src/student/index.ts) `releaseTask`、[`src/mentor/index.ts`](../../src/mentor/index.ts) `handle_mentor_cmd` 入参改为 `ScmClient`。

### 8.5 阶段 3：GitHub Adapter + Router + Handler 迁移

- **目标**：Probot（或自建 GitHub 路由）仅在边界把 payload **映射为 Canonical** 并调用 **router**；[`src/index.ts`](../../src/index.ts) 中的 `issues.labeled`、`issue_comment.created` 逻辑迁入 **只依赖 Canonical + deps** 的函数。
- **主要动作**：
  - 实现 `github.adapter`：验签/解析若仍由 Probot 承担，adapter 侧重「payload → Canonical」与 `deliveryId` 提取。
  - 实现 `eventRouter`：`IssueLabeled` / `IssueCommentCreated` 分发到对应 handler。
  - 迁移 `fetchConfig`：若仍读 `r2cn-dev` 等固定仓库，可保留在 GitHub 初始化路径或通过 `GitHubScmClient` 的只读扩展完成，避免 handler 绑死 `Context`。
- **验收**：GitHub 上原有行为（标签、评论、命令分支）与重构前一致；可通过人工在测试仓库点验或自动化 fixture。

**代码库已落实（阶段 3）**：[`src/webhooks/github-adapter.ts`](../../src/webhooks/github-adapter.ts)（`adaptGithub*`）；[`src/webhooks/event-router.ts`](../../src/webhooks/event-router.ts)（`dispatchCanonicalEvent`）；[`src/handlers/on-issue-labeled.ts`](../../src/handlers/on-issue-labeled.ts)、[`src/handlers/on-issue-comment-created.ts`](../../src/handlers/on-issue-comment-created.ts)；[`src/config/load-bot-config.ts`](../../src/config/load-bot-config.ts) 替代原 `index.ts` 内联 `fetchConfig`。Probot 入口 [`src/index.ts`](../../src/index.ts) 仅负责 **`onAny` 日志**、**构造 `GitHubScmClient`**、**adapter → router → handler**。后续演进已完成：`student` / `mentor` 改为直接消费 Canonical 子集（`Actor` / `IssueRef` / `LabelRef`），桥接层已删除。

### 8.6 阶段 4：Atomgit 路由与实现

- **目标**：**`POST /webhooks/atomgit`**（路径以最终实现为准）验签、映射、与 GitHub 共用 router + handlers。
- **主要动作**：按官方文档实现验签；维护 **Atomgit 事件 → Canonical** 映射表；无法映射的请求 debug 后 **200**；实现 **`AtomgitScmClient`** 对接 OpenAPI。
- **验收**：在 Atomgit 测试环境能触发与 GitHub 等价的 Canonical 流；写回评论等操作走 `AtomgitScmClient`。

**代码库已落实（阶段 4）**：[`src/webhooks/atomgit-webhook-route.ts`](../../src/webhooks/atomgit-webhook-route.ts) 在 Probot `getRouter("/webhooks/atomgit")` 上挂载 **`POST /webhooks/atomgit`**；[`src/webhooks/atomgit-verify.ts`](../../src/webhooks/atomgit-verify.ts) 支持 **token**（`X-Gitlab-Token` / `X-AtomGit-Token`）与 **`hmac-sha256`**；[`src/webhooks/map-atomgit-to-canonical.ts`](../../src/webhooks/map-atomgit-to-canonical.ts) 将 **GitLab 风格**（Atomgit 文档所述）的 **Note Hook（Issue 评论）**、**Issue Hook（labels 变更且仅新增一个标签）** 映射为 Canonical；[`src/scm/atomgit-scm-client.ts`](../../src/scm/atomgit-scm-client.ts) 实现 `ScmClient`（GitLab REST 子集）。`ScmClient` 方法增加可选 **`projectId`**（[`src/scm/types.ts`](../../src/scm/types.ts)），handler / `student` / `mentor` 在调用时传入 `repo.numericId` 或 `task.repo_id`。单测：[`test/atomgit-verify.test.ts`](../../test/atomgit-verify.test.ts)、[`test/atomgit-map.test.ts`](../../test/atomgit-map.test.ts)。**说明**：官方 payload 若与 GitLab 样例不一致，只需调整 `map-atomgit-to-canonical.ts`；跨仓读 `r2cn.yaml` 见 [`README.md`](../../README.md) Atomgit 节。

### 8.7 阶段 5：测试与质量

- **目标**：防止「改 GitHub 弄坏 Atomgit」或反之。
- **主要动作**：
  - 为 GitHub / Atomgit 各保存 **fixture payload**（脱敏）。
  - 单测：**adapter** 输出 Canonical 快照；**handler** 在 mock `ScmClient` 下断言分支与 API 调用参数。
  - 可选：对 router 做表驱动测试（事件类型 × 路由目标）。
- **验收**：CI 中相关测试稳定通过；关键回归场景有文档或 checklist。

**代码库已落实（阶段 5）**：`test/fixtures/github/`、`test/fixtures/atomgit/`、`test/fixtures/config/` 存放脱敏 payload 与最小 YAML；[`test/github-adapters-canonical.snapshot.test.ts`](../../test/github-adapters-canonical.snapshot.test.ts) 对 adapter 输出 Canonical 做快照；[`test/event-router.test.ts`](../../test/event-router.test.ts) 校验 `dispatchCanonicalEvent` 分发；[`test/on-issue-comment-created.test.ts`](../../test/on-issue-comment-created.test.ts) 在 mock `ScmClient` 下覆盖评论 handler 一条路径；另有 [`test/create-scm-client.test.ts`](../../test/create-scm-client.test.ts)、[`test/scm-backend-payload.test.ts`](../../test/scm-backend-payload.test.ts)。

### 8.8 阶段 6（可选）：后端 API 与字段语义

- **目标**：与第 7 节一致，统一 Canonical 字段并引入 `scm_provider`、`external_ref` 等跨平台元数据。
- **主要动作**：与后端服务协同改契约；bot 侧在 API 封装层（如 `src/task/` / `src/student/` 的请求构造）统一映射。
- **验收**：联调通过；旧客户端兼容策略（若有）书面说明。

**代码库已落实（阶段 6 bot 侧）**：[`src/api/scm-backend-payload.ts`](../../src/api/scm-backend-payload.ts) 提供 `scm_provider`、`external_ref` 的组装与合并；[`src/task/index.ts`](../../src/task/index.ts) 在 `getTask` 的 query、`newTask` / `updateTaskScore` / `checkTask` 的 POST 体中使用 Canonical 字段命名（`issue_id`、`repo_id`、`issue_number`、`mentor_login` 等）；[`src/student/index.ts`](../../src/student/index.ts)、[`src/mentor/index.ts`](../../src/mentor/index.ts) 在各后端 `POST` 中同步改名；[`Payload`](../../src/mentor/index.ts) 增加 `scmProvider`，由 [`on-issue-comment-created`](../../src/handlers/on-issue-comment-created.ts) 从 `event.repo.provider` 注入。全链路启用需与 r2cn API 团队联调。

### 8.9 PR 拆分建议

- **宜小步**：阶段 1 可单独 PR；阶段 2 可按「只迁评论」「只迁标签」拆 PR，降低冲突。
- **宜可回滚**：阶段 3 尽量保持对外 GitHub App / Webhook URL 不变，仅内部换调用链。
- **宜先绿后扩**：阶段 3 在 GitHub 全绿后再合阶段 4，避免双平台同时调试难以定位问题。
