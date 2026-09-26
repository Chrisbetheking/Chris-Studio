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

## 5. 失效的质量门禁：重建源码完整性守卫

### 现象

`npm run guard:source`（`scripts/source_guard.js`）长期返回 **19 项 FAIL**，
`npm run release:sanity`（`scripts/release_sanity.js`）返回 **8 项 FAIL**。
两处失败全部是 v1.5.5 / Windows 时代的固定断言，例如：

- `App.tsx VERSION is NOT v1.5.5`（该常量在 v2.4 已由版本同步逻辑取代）
- `main.rs MISSING ping_tauri`、`scan_project_directory not in handler`（命令已重命名/移除）
- `AboutScreen.tsx MISSING chriswangjob@163.com`（联系信息已收敛到 `app/identity.ts`）
- `Tauri version mismatch: Cargo=0 api=1 cli=1`（正则读不到 `version = "=1.8.3"` 的 `=` 前缀）
- `README.md: MISSING TokenFence-Studio-Windows-*-portable.zip`（Windows 打包线已退役）

由于两个脚本永远失败，**它们从未被 CI 或发布工作流调用**。这正是本次事故的直接原因：
一个删掉 284 个源文件的提交能够合入 `main`，而没有任何门禁会因此变红。

### 处置

1. **重写 `scripts/source_guard.js`** 为 v2.4 真实契约（76 项检查，0 错误通过）：
   - Overlay 完整性：列出 29 个被 UI / 原生 / 工作流直接依赖的文件，缺任何一个立即失败
   - 核心源码体量下限
   - 编码完整性：BOM、CR 字节、压缩成单行、U+FFFD
   - 发布与 CI 工作流契约：`--locked` 原生命令、`test:core`、`package-macos-release.sh`、禁止 `cargo generate-lockfile`
   - **原生命令注册表比对**：从 10 个前端客户端抽取全部 `invoke<...>('name')`，与 `generate_handler![...]` 比对，防"前端调用未注册命令"
   - 受审查事务安全契约：禁止 `git add -A`、要求超时守卫与已审查路径白名单
   - 统一 Agent 运行时契约：循环上限、有界上下文、必需工具、不可信输入规则
   - Tauri 主版本对齐（修正了 `=1.8.3` 解析）、产品版本一致性、开发者身份、凭证模式扫描

2. **重写 `scripts/release_sanity.js`**（59 项检查，0 错误通过）：版本一致性覆盖全部清单与 UI 标签、
   macOS 资产命名（`Chris-Studio-macOS-<slug>.dmg` / `.app.zip` / `Install-*.command`）、
   双语键树漂移检查（en 与 zh-CN 均为 582 键）、凭证模式扫描。

3. **接入门禁**：
   - `.github/workflows/ci.yml` 新增 `source-integrity` job，`desktop-ui` 通过 `needs` 依赖它
   - `.github/workflows/tokenfence-macos.yml` 的 `verify-desktop-ui` 在安装依赖前先跑两个守卫

4. **新增契约测试** `scripts/v2-4-guard-contract-test.cjs`：把两个守卫钉在工作流上，
   并断言 v1.5.x 遗留断言不得回归（防止守卫再次退化成永远失败）。

5. **重写 `docs/RELEASE_CHECKLIST.md`**：删除 Windows 安装路径与 `E:\Apps\...` 步骤，
   改为 macOS DMG / `/Applications` / 公证与签名流程，并明确区分"发布前本地验证"与"工作流验证"。

## 6. 运行时收据的持久化缺陷

### 现象

`features/unified-agent/runtimeStore.ts` 把整个运行收据数组（含 `screenshotDataUrl`）
原样写入 `localStorage`。而 macOS 截图的 data URL 达 **3 MB 级**（本次取证截图
2.4 MB PNG → base64 约 3.2 MB），而同源配额约 **5 MB**。

后果具有欺骗性：`persist()` 捕获异常后静默返回，因此

- 运行时收据历史会停止更新（用户看到"任务列表不再变化"）
- 更严重的是"重启后把未完成任务恢复为 interrupted"这一安全语义会失效——
  因为最后一次成功写入可能已是若干轮之前的状态

### 处置

1. **持久化投影**（`persistedProjection`）：写入前剥离全部 `screenshotDataUrl`。
   截图只服务于"当前审批窗口"，安全模型本就在下一次动作后使其失效，持久化没有价值。
2. **输出裁剪**：工具输出截断到 8 000 字符并附 `[truncated before persistence]` 标记；
   紧凑模式截断到 1 000 字符。
3. **配额降级**：投影超过 1.2 MB 预算时自动切换到紧凑投影（24 条收据 /
   1 000 字符输出）；若 `setItem` 仍抛异常（配额或序列化），再用紧凑投影重试一次。
   内存中的完整收据不受影响。
4. **恢复时修复**（`normalizePersistedRun`）：hydrate 阶段清除历史遗留的
   `data:` 截图字段，容忍 `events`/`approvals` 缺失或含空项，避免旧数据让整个存储解析失败。

### 边界测试

`scripts/v2-4-unified-runtime-store-test.cjs` 用可注入容量的假 `localStorage` 覆盖四个场景：

| 场景 | 断言 |
| --- | --- |
| 截图剥离 | 落盘内容不含 `data:image` 与 `screenshotDataUrl`；内存中仍保留完整截图与输出 |
| 配额降级 | 超容量时至少一次写入被拒，但最终仍收敛到可容纳的紧凑投影，且不丢收据 |
| 恢复修复 | 未完成任务恢复为 `interrupted`，旧待审批被拒绝，历史截图被清除，已完成任务状态不变 |
| 重置 | 内存与落盘同时清空 |

## 7. 验证命令

```bash
# 依赖
npm ci --legacy-peer-deps --no-audit --no-fund
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund

# 类型与测试
npm run typecheck                                   # web + shared + android
npm --prefix apps/desktop/ui run typecheck          # 桌面 UI（含 overlay 定稿）
npm --prefix apps/desktop/ui run test:core          # 17 个核心测试脚本

# 构建
npm --prefix apps/desktop/ui run build

# 原生
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test  --manifest-path apps/desktop/src-tauri/Cargo.toml
```
