# Chris Studio v2.1.0 功能实现状态

本文档区分“已经进入真实执行链路的能力”和“仍受边界限制的能力”，避免把展示页面、能力元数据或未来规划写成已经完成。

## 已实现并进入真实链路

### 多模型工作台

- DeepSeek、OpenAI、Anthropic、Gemini、Qwen、Kimi、豆包/Ark、智谱 GLM、OpenRouter、Ollama、LM Studio、自定义 OpenAI 兼容接口和 Local Sandbox。
- 多 Profile、活跃模型切换、连接测试、独立接口地址和模型名称。
- OpenAI-compatible 与 Anthropic 两类原生请求格式。
- 视觉模型可在用户明确启用后接收原始图片；否则图片只在本地 OCR 后发送文字。
- API Key 和 GitHub/MCP Token 通过系统凭证库保存，不写入浏览器 localStorage。

### 安全与 Token

- 提示词、文件提取内容、Coding Agent 仓库上下文统一扫描。
- API Key、访问令牌、密码、邮箱、电话、数据库 URL、私钥等模式检测和脱敏。
- 内容编辑后旧审查失效；高风险内容需要明确确认。
- Conservative / Balanced 本地 Token 压缩。
- 单次 Token 上限、每日预算、输入/输出/节约量记录。
- 本地历史记录与安全回执保存前再次处理。

### 文件、OCR、PDF 和本地知识库

- 文本、代码、Markdown、JSON、CSV、日志。
- PDF 文本层提取、页码标记，以及无文本页的本地 OCR 回退。
- DOCX 文本提取。
- XLSX 工作表转结构化文本。
- PNG、JPG、WEBP、BMP、TIFF OCR。
- `eng`、`chi_sim`、`eng+chi_sim` OCR 语言选择。
- 本地分块、关键词/多语言词元检索和上下文引用。
- 文件类型到 Provider/模型的显式路由。

### Coding Agent 工作区

- 用户选择一个明确目录作为项目边界。
- 浏览和读取文本文件，拒绝路径穿越、符号链接越界和 `.git` 写入。
- 编辑器写入前确认，并自动备份到 `.tokenfence/backups`。
- AI Patch Assistant：把脱敏后的仓库树、Git 状态、当前 Diff 和选中文件发送给活跃模型，要求返回计划与统一 Diff。
- 模型生成的 Diff 只会进入预览区，不会自动落盘。
- 用户确认后执行 `git apply --check`，再应用补丁并归档到 `.tokenfence/patches`。
- 固定白名单命令：Git status/diff、npm typecheck/test/build、cargo check/test。
- 创建分支、提交、推送和创建 GitHub Pull Request，每一步都要求确认。
- GitHub PAT 存入系统凭证库，可读取账号、仓库和 Issues。

### Computer Use（macOS Beta）

- 获取屏幕截图并在本地预览。
- 经用户单次批准后执行坐标点击。
- 经用户单次批准后输入文本。
- Enter、Escape、Tab、Space、Delete、Command+S、Command+L 白名单按键。
- 打开 macOS 屏幕录制与辅助功能设置。
- 本地审计日志。

### Skills、Agent 和 MCP

- 20 个内置 Skills。
- 自定义 Skill 创建、编辑、删除、权限声明、JSON 导入/导出。
- Agent 组合内置和自定义 Skills，并形成实际系统提示词。
- MCP/JSON-RPC 连接器支持 `initialize`、`tools/list`、`resources/list`、`prompts/list` 和 `tools/call`。
- 远程地址要求 HTTPS；本机可使用 localhost HTTP。
- `tools/call` 每次需要确认，Bearer Token 存入系统凭证库。

### 更新与发布

- 应用内检查指定 GitHub 仓库的 Latest Release。
- 显示版本、说明和 Apple Silicon/Intel 下载资源。
- GitHub Actions 双架构构建。
- 配置 Apple Developer 凭证时执行 Developer ID 签名和 Apple 公证流程。
- 未配置凭证时生成 ad-hoc 社区包与仅针对 Chris Studio 的安装助手。

## 已实现基础能力，但有意保留限制

### Coding Agent 不是无人值守全自动代理

v2.1.0 已经能生成、审查、检查、应用补丁并完成 Git 分支/提交/推送/PR 链路，但不会让模型在后台无限循环、自行批准写入或执行任意 Shell。用户仍是最终审批者。

### Computer Use 不提供无限制远程控制

当前动作仅限截图、坐标点击、文本输入和少量白名单按键。没有后台持续控制、无确认连续执行、任意 AppleScript 或任意终端命令。这是安全边界，不是遗漏。

### 本地知识库不是向量数据库

当前检索采用本地分块和词法/多语言词元评分，不需要上传文档或运行 Embedding 服务。大规模语义向量检索、PDF 坐标级引用和版面重建不在 v2.1.0 范围内。

### MCP 是 JSON 响应 Beta

支持常见的一次请求/一次 JSON 响应服务器。依赖长期 SSE 会话、复杂 OAuth 或自定义传输层的 MCP 服务仍需适配。

### 更新不会静默替换应用

应用负责检查和展示新版本，不会绕过用户直接安装。正式无警告安装依赖有效的 Apple Developer ID 与公证凭证。

## 无法由源码包替用户完成的事项

- Apple Developer Program 账号、Developer ID 证书和 App 专用密码必须由发布者本人提供。
- 第三方 Provider、GitHub 和 MCP 的真实密钥必须由用户自行配置。
- macOS 屏幕录制与辅助功能权限必须由用户在系统设置中授权。
- 私有 Git 推送仍依赖用户自己的 Git 凭证或 SSH 配置。

## v2.1.0 验收命令

```bash
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund
npm --prefix apps/desktop/ui run typecheck
npm --prefix apps/desktop/ui run test:core
npm --prefix apps/desktop/ui run build
python3 scripts/verify_tokenfence_patch.py
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

最后一项需要安装 Rust，并由 GitHub macOS/Windows Runner 完成平台相关编译验证。


## v2.1 统一工作区补充

身份、项目、Git、Skills 与 Computer Use 已增加同一对话入口；实际写入、点击、输入、按键与网络操作仍保持逐项确认。
