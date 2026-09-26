# Goal-Loop 运行记录：run-1 源码恢复与契约修复

本文记录 `goal-loop/run-1` 分支上的第一轮生产级加固。所有条目都对应一次真实的构建、
类型检查或测试失败，以及已落地的代码改动。

## 1. 背景：仓库源码缺失导致 CI 全红

### 现象

- `origin/main` 的 HEAD 提交（`754c4e7`）删除了 **284 个源文件**，涉及
  `apps/android`（49）、`apps/desktop`（179）、`apps/web`（56）。
- 其父提交 `31bcb6f` 又删除了 **17 个被工作流直接引用的脚本**，例如
  `scripts/verify-public-npm-locks.cjs`、`scripts/package-macos-release.sh`、
  `scripts/source_guard.js`。
- 结果是 GitHub Actions 的最新的 6 次运行全部 `failure`：
  - `Chris Studio CI`（桌面 UI + macOS 原生检查）
  - `Chris Studio macOS Builds and Release`

工作流本身仍然引用 `apps/desktop/ui/package.json`、`apps/desktop/src-tauri/src/main.rs`、
`apps/desktop/src-tauri/Cargo.lock`、`apps/desktop/ui/scripts/run-core-tests.cjs` 等文件，
但它们在工作树中已不存在，所以任何 job 都会在第一步失败。

### 处置

1. 从 `HEAD~1` 恢复 HEAD 删除的 284 个文件。
2. 从 `HEAD~2` 恢复父提交删除的 17 个脚本。
3. 打安全标签 `goal-loop/pre-restore-754c4e7` 指向恢复前的 `main`，便于对照回滚。

恢复后仓库回到 465+ 文件的完整叠加式（overlay）布局，`node scripts/finalize-v2.4.0-alpha.2.cjs`
可以正常输出 `CHRIS_STUDIO_V2_4_ALPHA2_OVERLAY_READY`。

## 2. 类型检查缺陷：受审查提交的路径参数丢失

**文件**：`apps/desktop/ui/src/features/projects/projectClient.ts`

原生命令 `project_git_commit(message, paths, confirmed, state)` 要求显式文件列表，
以保证提交只包含最新一次已审查事务中的文件。

UI 层 `ProjectsScreen.tsx` 正确地传入了三个参数：

```ts
const result = await commitProjectChanges(commitMessage, reviewedPaths, true);
```

但客户端封装只声明了两个参数，`tsc --noEmit` 直接报错
`TS2554: Expected 2 arguments, but got 3.`。

修复：让封装签名与原生命令对齐，并在客户端做一次去重、去空白与空值过滤，
形成"原生 allow-list 校验 + 客户端去重"的双层防线：

```ts
export async function commitProjectChanges(
  message: string,
  paths: string[],
  confirmed: boolean,
): Promise<ProjectCommandResult> {
  const reviewedPaths = Array.isArray(paths) ? Array.from(new Set(...)) : [];
  return await invoke<ProjectCommandResult>('project_git_commit', { message, paths: reviewedPaths, confirmed });
}
```

这条链路的安全性来自三层：Rust 侧拒绝不在最新审查事务内的路径、拒绝已暂存的其他文件、
并在提交前复核文件内容与审查时的 after 状态一致。

## 3. 核心测试契约随架构演进而失效

`npm --prefix apps/desktop/ui run test:core` 首轮运行 15 个脚本中 4 个失败。
根因是断言仍描述 v2.2/v2.3 的旧架构，而 v2.4 已把流式发送和协作流程迁移：

| 测试脚本 | 过时断言 | v2.4 的真实落点 |
| --- | --- | --- |
| `v2-2-codex-streaming-test.cjs` | `WorkspaceScreen.tsx` 内含 `sendProviderChatStream` / `onDelta` / `stopCurrentRequest` | 统一 Agent 运行时的 `features/unified-agent/manager.ts` |
| `v2-3-collaboration-test.cjs` | `WorkspaceScreen.tsx` 内含 `runCollaborativeAgent(` | 编码工作台 `screens/ProjectsScreen.tsx` + `features/agent-runtime/collaborativeRun.ts` |
| `v2-2-live-stream-computer-contract-test.cjs` | `if (settings.localHistoryEnabled) saveConversation(pending);` | `saveConversation(pending)` 后立即 `unifiedAgentManager.enqueue({...})` |
| `v2-3-project-change-session-test.cjs` | 工作流必须含 `cargo generate-lockfile` | v2.4 明确禁止 CI 变更 `Cargo.lock`，全部改用 `--locked` |

修复原则：**保留测试想守住的安全不变量，只更新它们的观测点**。例如：

- 扫描次数仍然必须为 1（`scanPayload(prompt, attachments` 出现一次），确保只有 Send 动作扫描真实 payload；
- 待发送内容必须在交给队列之前落盘（`saveConversation(pending)` 先于 `enqueue`）；
- 成功后立即清空并聚焦输入框（`setPrompt('')` → `composer.current?.focus()`），
  而队列拒绝时必须保留草稿；
- `Cargo.lock` 由仓库维护，CI 只用 `--locked`，并保留 `--nocapture` 的原生测试输出。

修复后 `test:core` 的 15 个脚本全部通过，并打印
`CHRIS_STUDIO_V2_2_CORE_TEST_SUITE_PASSED` 等三条套件标记。

## 4. 共享包类型错误与双语键缺口

`npm run typecheck`（根级，覆盖 `apps/web`、`packages/shared`、`apps/android`）在
`@tokenfence/shared` 上失败，共 8 处：

### 4.1 i18n：中文缺 77 个键

`packages/shared/src/i18n/zh-CN.ts` 以 `Translations = typeof en` 为契约，
但缺少 `providers.configure`、`chat.modelPickerTitle`、`common.scan`、
`settings`、`mascot`、`storage`、`project` 等 77 个键，同时多出 5 个 en 中不存在的键
（`nav.toolbox`、`nav.projects`、`nav.project`、`chat.modelConfigured`、`common.project`），
并有 4 处结构错位。

处置：按 `en.ts` 的键树重写 `zh-CN.ts`，保留全部既有中文译文，补齐缺失键，
删除多余键，修正结构错位。校验结果：缺失 0、多余 0。

### 4.2 `model-registry.ts` 直接引用 `localStorage`

`packages/shared` 的 `lib` 只有 `esnext`（无 DOM），4 处裸 `localStorage`
调用触发 `TS2304: Cannot find name 'localStorage'`。

处置：改用包内既有的 `agent-runtime/safeStorage`（浏览器走 `localStorage`，
无 DOM 环境回退到内存存储），并把"收藏/最近模型"的读取收敛到一个
`readModelList()` 帮助函数，对 `JSON.parse` 结果做元素级类型校验，
避免损坏的历史数据进入运行时。

## 5. 验证命令

```bash
# 依赖
npm ci --legacy-peer-deps --no-audit --no-fund
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund

# 类型与测试
npm run typecheck                                   # web + shared + android
npm --prefix apps/desktop/ui run typecheck          # 桌面 UI（含 overlay 定稿）
npm --prefix apps/desktop/ui run test:core          # 15 个核心脚本

# 构建
npm --prefix apps/desktop/ui run build

# 原生
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test  --manifest-path apps/desktop/src-tauri/Cargo.toml
```
