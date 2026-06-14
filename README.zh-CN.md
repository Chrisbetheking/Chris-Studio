# TokenFence Studio

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

面向大语言模型的本地优先 Prompt 安全、文档智能处理与多模型编排工作台。

**Prompt Guard** | **文档处理管线** | **模型矩阵** | **文件级路由** | **面向 Agent 的工作流**

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

## 功能矩阵

| 功能区域 | 能力 | 状态 |
|---|---|---|
| Prompt Guard | 检测密钥、凭据、Token、邮箱、手机号、数据库 URL 及危险 Prompt 内容 | 正常 |
| 脱敏 | 将敏感值替换为安全占位符 | 正常 |
| 文档智能 | PDF / DOCX / 图片 OCR 解析、清洗和分块 | 正常 / 部分实验 |
| 输出生成 | Markdown、HTML、JSON、PDF、ZIP-wrapped DOCX | 验收已验证 |
| 模型矩阵 | 并排对比多个模型响应 | 正常 |
| 文件级路由 | 按文件类型、风险和任务意图路由 | 正常 |
| Provider Hub | OpenAI、Claude、Gemini、DeepSeek、通义千问、Kimi、豆包、智谱、Ollama、LM Studio、自定义端点 | 正常；需用户提供密钥 |
| 本地运行时 | 执行已批准的本地任务并保存日志 | 已验证 |
| Obsidian 记忆 | 将输出笔记写入 test vault | 已验证 |
| API 连接器 | 测试真实或模拟 HTTP 连接器 | 已验证 |
| Computer Use | 权限门控操作流 | 实验功能 |
| Android Mobile Lite | 移动优先配套应用 | internal APK 已验证 |
| Windows Desktop | Tauri 桌面应用 | 实验性 i686 构建 |
| i18n | 英文 / 简体中文 UI 和 README | 正常 |

## 已验证工作流

当前产品候选验收流程验证了：

1. 本地运行时执行
2. Markdown / HTML / JSON / PDF / DOCX 输出生成
3. ZIP-wrapped DOCX 包结构
4. Obsidian test-vault 笔记写入与读回
5. Provider Hub 预设加载
6. 路由器主/回退规则加载
7. API 连接器测试流
8. Computer Use 已批准操作的权限门控
9. 危险命令拦截
10. README UTF-8 和直接下载链接检查

## 已知限制

- 这是发布候选版，不是 v1.0 最终生产版本。
- Windows Desktop 是 unsigned i686 实验性构建。
- Windows x64 因当前构建环境缺少 MSVC linker / 64-bit MinGW-w64 而被阻塞。
- macOS artifact 的 CI 已配置但尚未验证。
- Android 为 Mobile Lite，不是完整桌面对等功能。
- 不提供 Play Store 生产签名。
- 提供商调用需要用户提供 API 密钥。
- Computer Use 完整控制仍为实验功能。

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Web | 可用 | 完整 Next.js 工作台 |
| Android | 可用 | Expo React Native Mobile Lite。APK 可从 GitHub Releases 下载。 |
| Windows Desktop | 实验性 | Tauri 封装，unsigned experimental i686 |
| macOS Desktop | 实验性 | Tauri 封装，CI 已配置但 artifact 未验证 |
| iOS | 仅源码 | 用户需自行签名 |

## 快速开始

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm install --legacy-peer-deps
npm run dev
```

### API 密钥

本项目需要用户自行提供 API 密钥。支持的提供商包括 OpenAI、Anthropic Claude、Google Gemini、DeepSeek、火山引擎/豆包、阿里云/通义千问、Kimi/Moonshot、智谱 GLM、Ollama、LM Studio 以及自定义 OpenAI 兼容端点。

## 项目结构

| 目录 | 说明 |
|---|---|
| apps/web | Next.js Web 工作台 |
| apps/android | Expo React Native Android Mobile Lite |
| apps/desktop | Tauri 桌面封装 (Windows + macOS) |
| packages/shared | 跨平台共享逻辑 |
| docs | 产品文档 |

## 许可证

MIT License
