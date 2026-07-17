# Chris Studio v2.2.0

<p align="center"><strong>安全、多模型、节省 Token 的本地优先 AI Agent 工作台</strong></p>

Chris Studio 运行在用户与模型之间，在内容发送前完成敏感信息检查、附件处理、Token 压缩、模型路由和权限确认。v2.2.0 不再继续堆叠分散页面，而是优先补齐统一工作台的可靠性闭环：Agent 长任务状态、检查点、循环上限、最多三轮自动修复、取消与执行收据，以及可重试、可复核的 macOS Release 发布链路。

支持：`chriswangjob@163.com` · WeChat：`easymoneysniperchris`

[English](README.md) · [改名说明](RENAME_TO_CHRIS_STUDIO.zh-CN.md) · [快节奏路线](FAST_TRACK_ROADMAP.zh-CN.md) · [功能实现状态](docs/architecture/IMPLEMENTATION_STATUS_v2.0.zh-CN.md) · [macOS 签名与公证](docs/macos/SIGNING_NOTARIZATION.zh-CN.md) · [故障排查](docs/troubleshooting/TROUBLESHOOTING.zh-CN.md)

## v2.2.0 核心升级

- 不新增孤立的 Agent 控制页，可靠运行能力作为底层内核接回统一工作台；
- Agent 任务记录状态、检查点、循环次数、修复次数、补丁备份和最终执行收据；
- 自动修复默认最多三轮，超过上限明确停止，不无限消耗 Token；
- 补丁备份可以生成路径安全、逆序执行的回滚计划，并导出可保存的 JSON 执行收据；
- Provider 用量字段和错误码统一归一化，不在代码中硬编码价格，费用估算只接受用户或配置提供的费率；
- Computer Use 增加一次性审批票据、紧急停止、硬超时和坐标标记数据基础；
- 开发、类型检查和生产构建前自动同步 Chris Studio 身份与界面版本；
- Release 发布改为仓库自带 GitHub CLI 脚本，支持已存在 Release 的更新、单资源重试和远端资源核验；
- 根工作区、桌面包、UI、Cargo、Tauri 五处版本不一致时直接阻止构建；
- Apple Silicon 与 Intel 的 DMG、APP ZIP、安装助手、SHA-256、签名说明缺一不可；
- checkout、setup-node、artifact actions 同步到 GitHub 当前 Node 24 代际。

## 下载

### Apple Silicon（M1 / M2 / M3 / M4 / 后续 Apple 芯片）

- [下载 DMG](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Chris-Studio-macOS-Apple-Silicon.dmg)
- [下载 APP ZIP](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Chris-Studio-macOS-Apple-Silicon.app.zip)
- [下载社区安装助手](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Install-Chris-Studio-Apple-Silicon.command)
- [SHA-256](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/SHA256SUMS-Apple-Silicon.txt)

### Intel Mac

- [下载 DMG](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Chris-Studio-macOS-Intel.dmg)
- [下载 APP ZIP](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Chris-Studio-macOS-Intel.app.zip)
- [下载社区安装助手](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/Install-Chris-Studio-Intel.command)
- [SHA-256](https://github.com/Chrisbetheking/chris-studio/releases/latest/download/SHA256SUMS-Intel.txt)

> 上述链接在 v2.2.0 Release 构建并发布成功后生效。使用 Apple Developer ID 签名和 Apple 公证的包可以正常通过 Gatekeeper；没有配置 Apple 凭证时，工作流会发布 ad-hoc 签名社区包，并附带安装助手。

## v2.1.0 已有能力（v2.2.0 继续保留）

- “你是谁”由 Chris Studio 本地即时回答，不再显示底层模型品牌；
- 固定身份：由 Chris 全程设计与构建；
- 支持联系方式：`chriswangjob@163.com`、WeChat `easymoneysniperchris`；
- 安全请求无风险时支持一次点击完成审查并发送，`⌘/Ctrl + Enter` 快速发送；
- 模型等待期间显示实时耗时与状态，不再只显示无反馈转圈；
- 对话内可直接使用 `/project`、`/git status`、`/git diff`、`/check`、`/skills`、`/permissions`、`/screen`、`/type`、`/click`、`/key`；
- 新增 macOS 权限请求探针，使 Chris Studio 先触发系统授权，再打开辅助功能设置；
- 新 Logo 与黑曜石/象牙白/紫罗兰配色，替换原来的青绿色品牌色；
- CI、旧 Release 与 macOS Release 三套工作流已统一，避免旧工作流重复构建和缺依赖。

## 已实现功能

### 多模型与 Provider

内置 DeepSeek、OpenAI、Anthropic、Gemini、Qwen、Kimi、豆包/Ark、智谱 GLM、OpenRouter、Ollama、LM Studio、自定义 OpenAI 兼容接口和 Local Sandbox。

- 每个 Provider 可创建多个独立 Profile；
- API Key 按 Profile 存入 macOS Keychain / Windows Credential Manager；
- 保存并启用真实 Provider 后不会自动回退到本地模式；
- 支持 OpenAI-compatible 与 Anthropic 请求格式；
- 视觉模型可以接收用户明确授权的原始图片数据；
- 最终发送目标、模型与路由原因在发送前可见。

### 安全与 Token 控制

- 提示词和附件统一扫描；
- 检测 API Key、密码、邮箱、访问令牌等敏感内容；
- 严重风险只允许发送确认后的脱敏版本；
- 内容变化后旧审查立即失效；
- 本地历史保存前再次脱敏；
- Conservative / Balanced Token 压缩；
- 单次 Token 上限与每日 Token 预算；
- 今日输入、输出和节约 Token 用量记录；
- 对话上下文条数限制。

### 文件处理、OCR、PDF 与本地知识库

- TXT、Markdown、JSON、CSV、日志和常见代码文件；
- PDF 文本层提取和页码标记；
- 扫描版 PDF 页面渲染 OCR；
- DOCX 文本提取；
- XLSX 工作表转结构化文本；
- PNG、JPG、WEBP、BMP、TIFF 本地 OCR；
- 英文、简体中文和中英混合 OCR；
- 文件分块、本地索引和检索增强上下文；
- 不同文件类型可路由到不同 Provider / 模型。

### Coding Agent 工作区

项目页面提供受限目录式 Coding Agent 基础链路：

1. 用户选择明确项目目录，应用不能越界读取；
2. 浏览和编辑文本文件；
3. 每次写入都需确认，并在 `.tokenfence/backups` 创建备份；
4. 支持审查后应用统一 Diff，补丁归档到 `.tokenfence/patches`；
5. 只运行固定白名单检查：Git status / diff、npm typecheck / test / build、cargo check / test；
6. 创建 Git 分支、提交、推送；
7. 使用 Keychain 中的 GitHub PAT 读取仓库信息、Issues 并创建 Pull Request；
8. 所有写入、命令、网络推送和 PR 创建均要求用户确认。

该设计不是“任意 Shell”。模型不能自行执行任意命令，原生后端只暴露固定参数和受限目录能力。

### Computer Use（macOS Beta）

- 屏幕截图；
- 用户批准坐标后的鼠标点击；
- 用户批准文本后的键盘输入；
- Enter、Escape、Tab、Space、Delete、Command+S、Command+L 白名单按键；
- 跳转 macOS 辅助功能权限设置；
- 本地 Computer Use 审计日志；
- 每次动作单独确认，不提供无限制后台操控。

需要在“系统设置 → 隐私与安全性”中为 Chris Studio 开启屏幕录制与辅助功能权限。

### Skills 与工具连接

- 20 个内置 Skills，覆盖安全编程、仓库接手、发布诊断、隐私审查、OCR 清洗、表格分析、GitHub 维护、Computer Use Guard、知识库管理和预算控制；
- 自定义 Skill 创建、权限声明、JSON 导入/导出；
- Agent 可组合内置和自定义 Skills；
- MCP / JSON-RPC 工具连接器 Beta；
- 远程连接器强制 HTTPS，本机连接器可使用 localhost HTTP；
- `tools/call` 每次都需要用户明确确认；
- Connector Bearer Token 存入系统凭证库。

当前 MCP Beta 支持 JSON 响应的 `initialize`、`tools/list`、`resources/list`、`prompts/list` 和 `tools/call`。需要长期 SSE 会话的服务器可能仍需后续适配。

### GitHub 更新

应用可以读取指定公开仓库的 Latest Release，显示：

- 当前版本；
- 最新版本；
- 发布时间；
- Release Notes；
- Apple Silicon / Intel 安装资源；
- 是否有新版本。

应用不会静默替换自身，下载和安装始终由用户确认。

## macOS “已损坏”问题

正式解决方式是给 GitHub Actions 配置 Apple Developer ID 签名和公证所需 Secrets。工作流已支持：

```text
APPLE_CERTIFICATE
APPLE_CERTIFICATE_PASSWORD
APPLE_ID
APPLE_PASSWORD
APPLE_TEAM_ID
```

未配置这些凭证时，Release 会包含 ad-hoc 签名社区包与 `Install-Chris-Studio-*.command`。安装助手会复制应用到 `/Applications`，只清除 Chris Studio 自身的 quarantine 属性，不会关闭全局 Gatekeeper。

详见：[macOS 签名、公证与社区安装包](docs/macos/SIGNING_NOTARIZATION.zh-CN.md)。

## 本地开发

要求：

- Node.js 20–22；
- Rust stable；
- Xcode Command Line Tools；
- macOS 原生构建需要 Tauri CLI 1.6.x。

安装与前端检查：

```bash
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund
npm --prefix apps/desktop/ui run typecheck
npm --prefix apps/desktop/ui run test:core
npm --prefix apps/desktop/ui run build
```

原生检查与开发：

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cd apps/desktop
tauri dev
```

生产构建：

```bash
cd apps/desktop
tauri build
```

## 发布 v2.2.0

上传完整源码后进入：

```text
GitHub → Actions → Chris Studio macOS Builds and Release → Run workflow
```

填写：

```text
version: v2.2.0
create_release: true
make_latest: true
```

工作流会：

1. 检查锁文件中是否含私有 Registry；
2. 安装桌面 UI 依赖；
3. 执行 TypeScript 检查；
4. 执行隐私、Token 和知识库核心测试；
5. 构建桌面 UI；
6. `cargo check` 原生后端；
7. 分别构建 Apple Silicon 和 Intel；
8. 有 Apple 凭证时签名并公证；
9. 无 Apple 凭证时生成 ad-hoc 社区包和安装助手；
10. 创建或更新 GitHub Release。

## 安全边界

Chris Studio 不是防病毒软件，也不能保证识别所有隐私。任何涉及项目写入、命令运行、Computer Use、MCP 工具执行、Git 推送和 Pull Request 的操作都必须由用户审查。不要向未知 Provider 或工具服务发送真实机密。

## License

MIT
