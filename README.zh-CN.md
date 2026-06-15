# TokenFence Studio

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

面向大语言模型的本地优先 Prompt 安全、文档智能处理与多模型编排工作台。

**Prompt Guard** | **文档处理管线** | **模型矩阵** | **文件级路由** | **面向 Agent 的工作流**

## 最新下载

- [Android APK](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.0/TokenFence-Studio-Android-v1.0.0-release.apk)
- [Windows 便携版 ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.3/TokenFence-Studio-Windows-v1.0.3-portable.zip)
- [Windows 便携版 ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.3/TokenFence-Studio-Windows-v1.0.3-portable.zip)
- [Windows 便携版 ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.3/TokenFence-Studio-Windows-v1.0.3-portable.zip)

> Android APK 是已在模拟器验证的 internal release 构建。Windows Desktop 是 unsigned experimental i686 构建。Windows x64 和 macOS artifacts 仍待完成。

[更新日志](CHANGELOG.md) | [GitHub](https://github.com/Chrisbetheking/tokenfence-studio) | [English](README.md)

---

## 项目简介

TokenFence Studio 是一个面向大语言模型的本地优先 AI 工作台，位于用户和模型之间。

它提供内容检查、清洗、脱敏、分块和路由能力，让输入在进入模型之前先经过安全处理。

## 功能矩阵

| 领域 | 能力 | 状态 |
|---|---|---|
| Prompt Guard | 检测密钥、凭据、Token、邮箱、手机号、数据库 URL 和高风险 Prompt 内容 | 可用 |
| 脱敏 | 将敏感值替换为安全占位符 | 可用 |
| 文档智能 | PDF / DOCX / 图片 OCR 解析、清洗和分块 | 可用 / 实验 |
| 输出生成 | Markdown、HTML、JSON、PDF、ZIP-wrapped DOCX | 已验证 |
| 模型矩阵 | 并排比较多个模型输出 | 可用 |
| 文件级路由 | 按文件类型、风险和任务意图路由 | 可用 |
| Provider Hub | OpenAI、Claude、Gemini、DeepSeek、Qwen、Kimi、Doubao、Zhipu、Ollama、LM Studio、Custom | 可用，需用户配置 Key |
| 本地 Runtime | 执行已批准的本地任务并保存日志 | 已验证 |
| Obsidian Memory | 写入 test vault 笔记 | 已验证 |
| API Connector | 测试真实或模拟 HTTP connector | 已验证 |
| Computer Use | 带权限审批的动作流 | 实验性 |
| Android Mobile Lite | 移动端 companion app | internal APK 已验证 |
| Windows Desktop | Tauri 桌面应用 | i686 实验构建 |
| i18n | 英文 / 简体中文 UI 和 README | 可用 |

## 已验证工作流

当前成品候选版验收流程已验证：

1. 本地 Runtime 执行
2. Markdown 输出生成
3. HTML 输出生成
4. JSON 输出生成
5. PDF 输出生成
6. ZIP-wrapped DOCX 输出生成
7. Obsidian test vault 写入与读回
8. Provider Hub 预设加载
9. Router primary / fallback 规则加载
10. API Connector 测试流程
11. Computer Use 审批动作流
12. 危险命令阻断
13. README UTF-8 检查
14. 直达下载链接检查

## 已知限制

- 当前是 release candidate，不是最终 v1.0 production release。
- Windows Desktop 是 unsigned i686 experimental build。
- Windows x64 受缺少 MSVC linker / 64-bit MinGW-w64 阻塞。
- macOS artifact 已准备 CI，但尚未验证。
- Android 是 Mobile Lite，不是桌面端完整复制版。
- 暂无 Play Store production signing。
- Provider 调用需要用户自行提供 API Key。
- Computer Use 完整控制仍为实验功能。

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Web | 可用 | 完整 Next.js 工作台 |
| Android | 可用 | Expo React Native Mobile Lite |
| Windows Desktop | 实验性 | Tauri 封装，unsigned i686 |
| macOS Desktop | 实验性 | CI 已配置但 artifact 未验证 |
| iOS | 仅源码 | 用户需自行签名 |

## 快速开始

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm install --legacy-peer-deps
npm run dev
```

## API 密钥

本项目需要用户自行提供 API 密钥。

支持的提供商包括 OpenAI、Anthropic Claude、Google Gemini、DeepSeek、通义千问、Kimi、豆包、智谱、Ollama、LM Studio 以及自定义 OpenAI 兼容端点。

## 项目结构

| 目录 | 说明 |
|---|---|
| apps/web | Next.js Web 工作台 |
| apps/android | Expo React Native Android Mobile Lite |
| apps/desktop | Tauri 桌面封装 |
| packages/shared | 跨平台共享逻辑 |
| docs | 产品文档 |

## 许可证

MIT License
