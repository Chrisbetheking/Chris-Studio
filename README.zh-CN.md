# Chris Studio v2.4.0-alpha.2

**一个面向编程、隐私感知模型路由、受审查 macOS 操作和结构化多模型对比的本地优先 AI Agent 工作台。**

Chris Studio 位于用户、本地文件、电脑操作和 AI 模型之间。高风险动作不会在后台静默发生：项目写入先展示 Diff，原生操作需要单次批准，敏感内容先在本地扫描，Agent 的完成结论必须由真实工具结果支撑。

> 当前仍是 Alpha 测试版。请优先使用测试项目，并逐项检查写入、命令、模型请求和 Computer Use 操作。

[English](README.md)

## v2.4.0-alpha.2 新增内容

### 一个对话框里的统一 Agent

主工作区同时支持普通流式对话和持续工具循环。模型可以在同一条对话时间线中：

1. 扫描项目并搜索代码；
2. 读取真实文件；
3. 生成多文件统一 Diff；
4. 等待用户选择并批准文件；
5. 应用带快照的事务；
6. 运行白名单 npm/Cargo 检查；
7. 读取 macOS Accessibility 元素；
8. 执行一次受批准操作；
9. 再次观察结果并继续修复；
10. 只有获得真实证据后才给出完成结论。

任务按照会话分别排队，快速重复发送不会产生重复任务；一个会话等待审批时不会卡死其他会话；应用重启后，未完成任务会明确标记为“已中断”，不会伪装成成功。

### 内容感知隐私路由

发送前，Chris Studio 会在本地分析实际文字和附件名称，而不只看文件后缀。当前确定性分类器综合判断：

- API Key、Token、私钥、带凭据的数据库地址和 Session；
- 身份信息、医疗、财务、工资、客户数据；
- 保密、未公开、内部架构和安全事件等语义信号；
- `.env`、凭据目录、`.pem`、`.key`、`.p12`、keystore 等路径和扩展名；
- 已有的正文脱敏与自定义敏感词。

最终给出三种路线：

```text
可远程处理
远程前需确认
建议仅本地
```

当前还没有使用 Embedding 或轻量分类模型，也不能证明某段内容绝对安全。判断不确定或风险较高时会采取保守路线，并在使用远程模型前再次要求明确确认。

### 真实的结构化多模型对比

统一 Agent 可以先读取已启用的模型配置，再经用户批准，把同一段已审查提示词发送给 2—3 个指定模型。返回结果会在本地整理为：

- 共同观点；
- 数字、肯否定和结论上的潜在冲突；
- 每个模型独有但其他模型没有覆盖的内容；
- 字数、句子、列表、标题和模糊措辞统计；
- 各模型原始回答。

因此它不再只是把回答左右并排，而是可以真正用于模型调试和评估，并且仍然放在同一个对话框内。

### 更安全的 Coding Agent 事务

- Agent 修改已有文件前必须先真实读取该文件。
- 搜索只能用于定位文件，不能冒充已经读取全文。
- 所有写入都以统一 Diff 形式预览。
- 用户可以逐个取消不想应用的文件。
- 应用前后保存事务快照。
- 可接受本次事务，也可回滚所选文件。
- 文件被用户再次手工修改后，回滚会因冲突而停止，不会强行覆盖。
- Git Diff 和提交可以只限制在本次 Agent 事务文件内。
- 删除旧版危险的 `git add -A`，避免把用户原有修改一起提交。
- npm 和 Cargo 仅运行允许的检查预设，并带超时、输出上限和常见 API Token 环境变量清理。

### Accessibility 优先的 Computer Use

Agent 会先通过 macOS Accessibility 读取受支持应用的窗口、按钮名称、角色、状态和可执行动作，再选择具体元素。只有结构化操作无法完成时，才允许在当前已批准截图上使用坐标点击。

每次操作后都会让旧截图和旧元素索引失效，避免连续盲点或使用已经变化的界面状态。

当前 Alpha 支持：

- 文本编辑
- 备忘录
- Safari
- Finder
- 终端
- 系统设置

## 统一 Agent 工具

```text
project.scan
project.search
project.read
project.git_status
project.git_diff
project.propose_patch
project.run_check
privacy.classify
models.list
models.compare
computer.inspect
computer.activate
computer.capture
computer.open
computer.type
computer.key
computer.click
```

模型不能调用任意 Shell。项目命令仅限：

```text
npm-typecheck
npm-test
npm-build
cargo-check
cargo-test
```

## 现有产品底座

Chris Studio 还保留并继续使用：

- DeepSeek、OpenAI、Anthropic、Gemini、Qwen、Kimi、豆包/Ark、智谱 GLM、OpenRouter、Ollama、LM Studio、自定义 OpenAI 兼容接口和本地安全沙箱；
- 系统凭据存储；
- 文本、代码、PDF、DOCX、XLSX、图片与 OCR 处理；
- 本地知识切片和关键词检索；
- 提示词及附件脱敏；
- Skills、受审查 MCP、GitHub 集成、本地历史和发布诊断；
- Apple Silicon 与 Intel 双架构构建流程。

## 构建与验证

工作流会自动完成 v2.4 源码收口，然后检查产品版本、TypeScript 生产依赖图、隐私分类与结构化对比测试、前端构建、锁定版 Rust 编译与测试，以及 Apple Silicon/Intel 打包。

```bash
npm ci --prefix apps/desktop/ui --legacy-peer-deps --no-audit --no-fund
npm --prefix apps/desktop/ui run typecheck
npm --prefix apps/desktop/ui run test:core
npm --prefix apps/desktop/ui run build
cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

运行 GitHub Actions 中的 **Chris Studio macOS Builds and Release**：

```text
version：v2.4.0-alpha.2
create_release：true
make_latest：false
persist_source：true
```

Alpha 会自动作为 Pre-release 发布，不会覆盖最新正式版。`persist_source：true` 时，工作流会先核对严格文件白名单，再把确定性的源码收口结果提交回所选分支；GitHub Desktop 用户不需要运行下载来的 `.command` 脚本。

## 当前尚未完成

v2.4.0-alpha.2 目前还不包含：内置 Chromium/Playwright、任意网页 DOM 控制、PTY 实时终端、OCR 视觉定位、内置 Node/Python Sidecar、本地 Embedding/模型包和完整离线 Runtime 安装包。这些仍属于后续阶段，本版本不会把它们写成已经完成。

## 安全边界

Chris Studio 不是杀毒软件，也无法识别所有秘密和恶意指令。仓库正文、命令输出、网页、截图、MCP 工具和模型回答都应视为不可信输入。远程发送、文件写入、命令、Computer Use、Git 推送和 PR 都应人工检查。

## 开源协议

MIT
