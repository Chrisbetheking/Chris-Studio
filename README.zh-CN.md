# TokenFence Studio

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

<p align="center">
  <img src="./docs/images/banner.png" alt="TokenFence Studio" width="100%">
</p>

<p align="center">
  <strong>面向大语言模型的本地优先 Prompt 安全、文档智能处理与多模型编排工作台</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> | <strong>中文</strong>
</p>

---

## 项目简介

**TokenFence Studio** 是一个面向大语言模型（LLM）的本地优先安全编排工作台，提供 Prompt 安全扫描、文档智能处理、模型矩阵对比和上下文安全路由。

不是又一个聊天界面。核心思路是在用户输入到达 LLM 之前，构建一个可检查、可清洗、可保护、可分块、可路由的 Pre-LLM 层。

---

## 下载 (v0.5.24)

### Android Mobile Lite

**推荐 APK：** [TokenFence-Mobile-Lite-Android-v0.5.24-internal-release.apk](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Mobile-Lite-Android-v0.5.24-internal-release.apk)

- internal release APK，无需 Metro 开发服务器即可运行
- 已在 Android 模拟器完成安装和启动测试
- 不是 Google Play production-signed build

### Windows 桌面端 (Experimental)

**推荐：** [tokenfence-studio-windows-v0.5.24-i686-unsigned.exe](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/tokenfence-studio-windows-v0.5.24-i686-unsigned.exe)

- unsigned experimental i686 portable exe
- 已完成本地 smoke test 并成功启动
- x64 构建等待 toolchain 支持

安装包： [MSI](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Studio-Windows-v0.5.24-i686-unsigned.msi) | [Setup.exe](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v0.5.24/TokenFence-Studio-Windows-v0.5.24-i686-unsigned-setup.exe)

---

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Web | 可用 | 完整 Next.js 工作台 |
| Android | 可用 | Expo React Native Mobile Lite。APK 可从 GitHub Releases 下载。 |
| Windows Desktop | 实验性 | Tauri 封装，unsigned experimental i686 |
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

使用 Expo Go 扫描二维码，或连接 Android 设备/模拟器。

### 桌面端开发

需要 Rust 和 Tauri CLI。详见 [docs/RELEASES.md](./docs/RELEASES.md)。

### API 密钥

本项目需要用户自行提供 API 密钥。支持的提供商包括 OpenAI、Anthropic Claude、Google Gemini、DeepSeek、火山引擎/豆包、阿里云/通义千问、Kimi/Moonshot、智谱 GLM、Ollama、LM Studio 以及自定义 OpenAI 兼容端点。

---

## 项目结构

| 目录 | 说明 |
|---|---|
| apps/web | Next.js Web 工作台 |
| apps/android | Expo React Native Android Mobile Lite |
| apps/desktop | Tauri 桌面封装 (Windows + macOS) |
| packages/shared | 跨平台共享逻辑 |
| docs | 产品文档 |

---

## 功能特性

- 响应式 Web 工作台（Chat、Guard、Document Pipeline、Model Matrix、Provider Settings、Archive、Agent Packs）
- Android Mobile Lite App（prompt 扫描、模型路由、脱敏本地归档）
- Windows Desktop Tauri 封装（实验性 i686，已本地 smoke test）
- 多提供商支持（11 个 provider profile，含 DeepSeek、通义千问、Kimi、豆包、智谱、Ollama 等）
- 本地 Agent 运行时（Computer Use 权限控制、Obsidian 知识库写入、PDF/DOCX 输出生成）
- v1.0.0-rc1 经过 35 项验收测试

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
| Obsidian 写入 | test vault 写入与读回已验证 |
| PDF 输出 | 已验证 |
| DOCX 输出 | Flat OOXML（rc2 目标为 ZIP-wrapped DOCX） |
| Provider Hub | 11 个 provider profile |
| Computer Use | 权限流已验证，完整控制仍为实验功能 |

---

## 重要说明

- **v0.5.24 是当前稳定版本** — 推荐 Android APK 无需 Metro
- **Android APK** 可从 GitHub Releases 下载（internal-release，不是 Play Store 签名构建）
- **Windows/macOS** 桌面安装包仍处于实验阶段
- **API 密钥** 需用户自行提供，TokenFence 不存储用户的 API 密钥
- **DOCX** 当前为 Flat OOXML 格式，正式 OOXML ZIP 封装计划在 rc2 中完成
