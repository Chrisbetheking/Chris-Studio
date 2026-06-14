# TokenFence Studio

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

面向大语言模型的本地优先 Prompt 安全、文档智能处理与多模型编排工作台。

**Prompt Guard** ｜ **文档处理管线** ｜ **模型矩阵** ｜ **文件级路由** ｜ **面向 Agent 的工作流**

## 最新下载

- [Android APK（推荐）](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Mobile-Lite-Android-v0.5.24-internal-release.apk)
- [Windows 便携版 EXE（推荐）](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/tokenfence-studio-windows-v0.5.24-i686-unsigned.exe)
- [Windows MSI 安装包](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Studio-Windows-v0.5.24-i686-unsigned.msi)
- [Windows Setup EXE 安装包](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Studio-Windows-v0.5.24-i686-unsigned-setup.exe)

> Android APK 是已在模拟器中验证的 internal release 构建。Windows Desktop 是 unsigned experimental i686 构建。Windows x64 和 macOS artifacts 仍待完成。

[更新日志](CHANGELOG.md) | [GitHub](https://github.com/Chrisbetheking/tokenfence-studio) | [English](README.md)

---

## 项目简介

**TokenFence Studio** 是一个面向大语言模型（LLM）的本地优先安全编排工作台，提供 Prompt 安全扫描、文档智能处理、模型矩阵对比和上下文安全路由。

不是又一个聊天界面。核心思路是在用户输入到达 LLM 之前，构建一个可检查、可清洗、可保护、可分块、可路由的 Pre-LLM 层。

```
原始 Prompt / 上传文件
    → 文档智能管线
    → Prompt Guard + 脱敏
    → 意图检测
    → 上下文压缩
    → 模型矩阵 / 文件级路由
    → 最终 Prompt 预览
    → LLM 提供商或本地模型
```

目标是让 LLM 使用更安全、更干净、更易于调试。

---

## 为什么选择 TokenFence？

大多数 AI 工具关注模型访问。TokenFence Studio 关注**模型访问之前**发生的事：

- Prompt 中是否包含密钥或隐私数据？
- PDF、DOCX、日志、Markdown 文件能否先清洗？
- 噪音页眉、页码、重复文字能否去除？
- 文档能否转为 RAG 就绪的分块？
- 哪个模型应该处理这个任务或文件？
- 文件应该发送到云端模型、本地模型，还是走更安全的脱敏流程？
- 多个模型的输出能否并排对比？

这让 TokenFence 更接近一个**Pre-LLM 安全编排层**，而非普通的 ChatGPT 风格界面。

---

## 产品截图

| GitHub README | 最新下载 | 中文 README | GitHub Release |
|---|---|---|---|
| ![GitHub README](docs/assets/screenshots/github-readme-home.png) | ![最新下载](docs/assets/screenshots/github-latest-downloads.png) | ![中文 README](docs/assets/screenshots/github-readme-zh-cn.png) | ![GitHub Release](docs/assets/screenshots/github-release-current.png) |

> 桌面端截图正在更新中。Windows portable exe 已完成本地 smoke test。

---

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Web | 可用 | 完整 Next.js 工作台 |
| Android | 可用 | Expo React Native Mobile Lite。APK 可从 GitHub Releases 下载。 |
| Windows Desktop | 实验性 | Tauri 封装，unsigned experimental i686，已本地 smoke test |
| macOS Desktop | 实验性 | Tauri 封装，CI 已配置但 artifact 未验证 |
| iOS | 仅源码 | 用户需自行签名 |

---

## 快速开始

### Web 工作台

```bash
cd apps/web
npm install
npm run dev
```

打开 http://localhost:3000。

### Android Mobile Lite

```bash
cd apps/android
npm install
npm run start
```

用 Expo Go 扫描二维码，或连接 Android 设备/模拟器。

### 桌面应用

```bash
cd apps/desktop
npm install
npm run dev
```

需要 Rust 和 Tauri CLI。详见 [docs/RELEASES.md](./docs/RELEASES.md)。

### API 密钥

创建 `.env.local` 或在 Provider 设置页面保存密钥。

```env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
VOLCENGINE_API_KEY=
DASHSCOPE_API_KEY=
QIANFAN_API_KEY=
MOONSHOT_API_KEY=
ZHIPU_API_KEY=
MINIMAX_API_KEY=
SILICONFLOW_API_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=
TOGETHER_API_KEY=
THREE_ZERO_TWO_API_KEY=
MODELSCOPE_API_KEY=
```

如果只用 Ollama 或 LM Studio，云端 API 密钥为可选项。

---

## 项目结构

```tokenfence-studio/
  apps/
    web/           Next.js Web 工作台（完整 TokenFence Studio）
    android/       Expo React Native Android Mobile Lite
    desktop/       Tauri 桌面封装（Windows + macOS）
  packages/
    shared/        共享 TypeScript 逻辑（guard、providers、routing）
  docs/
    changelog/     各版本开发笔记
    images/        横幅与截图
  examples/        测试用示例文档
  cli/             CLI 工具（计划中）
  mcp/             MCP 集成（计划中）
  .github/
    workflows/     CI/CD（release、lint）
  package.json     根工作区配置
  tsconfig.base.json
```

| 包 | 说明 |
|---|---|
| `apps/web` | 完整 Next.js Web 工作台，含 Chat、Guard、Document Pipeline、Model Matrix、Provider Settings、Archive、Agent Packs |
| `apps/android` | Android Mobile Lite App，Expo / React Native 构建 — Prompt 扫描、模型路由、脱敏本地归档 |
| `apps/desktop` | Tauri 桌面封装，Windows 和 macOS（实验性） |
| `packages/shared` | 跨平台纯 TypeScript 逻辑 — Guard 扫描、Provider 预设、文件路由、存储辅助 |

---

## 功能特性

- 响应式 Web 工作台（Chat、Guard、Document Pipeline、Model Matrix、Provider Settings、Archive、Agent Packs）
- Android Mobile Lite App（Prompt 扫描、模型路由、脱敏本地归档）
- Windows Desktop Tauri 封装（实验性 i686，已本地 smoke test）
- 多提供商支持（11 个 Provider Profile，含 DeepSeek、通义千问、Kimi、豆包、智谱、Ollama 等）
- 本地 Agent 运行时（Computer Use 权限控制、Obsidian 知识库写入、PDF/DOCX 输出生成）
- Prompt Guard 敏感数据扫描
- 脱敏引擎（结构化占位符替换）
- 风险策略配置
- 上下文压缩
- 模型矩阵多模型对比
- 文件级模型路由
- 文档智能管线（PDF 文本提取、DOCX 解析、本地图片 OCR、噪音清洗、分块生成）
- 本地脱敏归档
- 共享 TypeScript 逻辑包（packages/shared）
- GitHub Releases CI/CD Workflow

### 实验性 / 开发中

- Provider 故障转移链
- 成本与延迟预算路由
- 来源引用面板（原型）
- 桌面存储路径选择
- 文件类型模型路由规则
- 桌面静态渲染器打包

### 计划中

- 扫描版 PDF 页面 OCR
- 复杂 PDF / 表格的布局感知解析
- 搜索 Grounding 路由
- Judge 模型合并多模型输出
- MCP 市场
- VS Code 扩展
- 浏览器扩展
- 本地向量搜索
- 团队工作区
- 插件/技能市场

---

## 当前状态

| 模块 | 状态 |
|---|---|
| Web UI | 可用 |
| Android Mobile Lite | internal release APK 已验证 |
| Windows Desktop | i686 unsigned experimental，可运行 |
| Windows x64 | 等待 MSVC linker / 64-bit MinGW |
| macOS | CI 已配置，artifact 未验证 |
| Local Runtime | v1.0.0-rc1 acceptance 已验证 |
| Obsidian 写入 | Test Vault 写入与读回已验证 |
| PDF 输出 | 已验证 |
| DOCX 输出 | Flat OOXML（rc2 升级为 ZIP-wrapped DOCX） |
| Provider Hub | 11 个 Provider Profile |
| Computer Use | 权限流已验证，完整控制仍为实验功能 |

---

## 架构

```
用户输入 / 上传文件
         |
         v
文档智能管线
         |-- 解析器
         |-- 清洗器
         |-- 分块器
         |-- 元数据构建
         |
         v
Prompt Guard
         |-- 扫描器
         |-- 脱敏器
         |-- 风险评估
         |-- 压缩器
         |
         v
模型矩阵 / 路由器
         |-- Prompt 级多模型运行
         |-- 文件级模型路由
         |-- 敏感文件本地模型优先
         |-- 未来 Judge 模型 / 故障转移链
         |
         v
Provider 层
         |-- 全球 Provider
         |-- 国内 Provider
         |-- Router Provider
         |-- 本地 Provider
         |
         v
响应 / 对比 / 归档 / 导出上下文
```

---

## 发布版本

- **v1.0.0-rc2** 是当前产品候选版本
- **推荐 Android APK**: `TokenFence-Mobile-Lite-Android-v0.5.24-internal-release.apk`（57.3 MB，独立运行，无需 Metro）。可从 [v1.0.0-rc2 Release](https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v1.0.0-rc2) 和 [v0.5.24 Release](https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v0.5.24) 获取。
- **Windows**：桌面安装包（MSI 与 NSIS installer），使用 Tauri 2 本地构建。**macOS**：实验性，GitHub Actions CI 构建中。
- **iOS** 仅提供源码，用户需自行签名

详见 [docs/RELEASES.md](./docs/RELEASES.md) 了解当前发布状态和故障排除。

---

## 更新日志

近期更新和开发笔记请见 [更新日志](./docs/changelog/README.md)。

---

## 贡献

欢迎提交 Issue 和 Pull Request。

特别有帮助的方向：
- 更好的文档解析器
- 扫描版 PDF OCR 与视觉模型集成
- 新 Provider 适配器
- 更好的检测规则
- Search Grounding 集成
- 文件路由启发式算法
- 模型对比工作流
- Agent / MCP 使用场景

---

## 作者

由 **ChrisWang** 创建。

致力于构建实用的 AI 基础设施。

---

## 许可证

MIT License