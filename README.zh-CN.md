# TokenFence Studio

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

TokenFence Studio 是一个面向大语言模型（LLM）的本地优先安全编排工作台，提供 Prompt 安全扫描、文档智能处理、模型矩阵对比和上下文包管理等功能。

## 为什么做这个项目

随着 LLM 在企业环境中的广泛应用，对提示词安全、数据隐私和多模型管理的需求日益增长。TokenFence Studio 旨在提供一个开源的、本地优先的解决方案。

## 核心功能

- **Prompt Guard**：提示词安全扫描、脱敏处理、风险评分
- **Document Pipeline**：文档解析、OCR 支持、智能分块
- **Model Matrix**：多模型响应对比、延迟/成本评估
- **Provider Settings**：支持全球、中国区、路由和本地模型提供商
- **Archive**：可搜索的历史记录、风险过滤
- **Agent Context Pack**：上下文包管理原型

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Web | 可用 | 完整 Next.js 工作台 |
| Android | 可用 | Expo React Native Mobile Lite。APK 可从 GitHub Releases 下载 |
| Windows Desktop | 实验性 | Tauri 封装 |
| macOS Desktop | 实验性 | Tauri 封装 |
| iOS | 仅源码 | 用户需自行签名 |

## 快速开始

### Web 工作台

\\\ash
cd apps/web
npm install
npm run dev
\\\

打开 http://localhost:3000。

### Android Mobile Lite

\\\ash
cd apps/android
npm install
npm run start
\\\

使用 Expo Go 扫描二维码，或连接 Android 设备/模拟器。

### 桌面应用

需要 Rust 和 Tauri CLI。详见 [docs/RELEASES.md](./docs/RELEASES.md)。

### API 密钥

在设置中配置 API 密钥。支持的提供商包括 OpenAI、Anthropic Claude、Google Gemini、DeepSeek、阿里云/通义千问、百度千帆、Kimi/Moonshot、智谱 GLM、MiniMax、SiliconFlow 等。

## 项目结构

\\\
apps/
  web/          Next.js web 工作台
  android/      Expo React Native Android Mobile Lite
  desktop/      Tauri 桌面封装 (Windows + macOS)
packages/
  shared/       跨平台共享 TypeScript 逻辑
.github/
  workflows/    CI/CD
\\\

## 当前状态

### 已完成

- 响应式 Web 工作台（Chat、Guard、Document Pipeline、Model Matrix、Provider Settings、Archive、Agent Packs）
- Android Mobile Lite 应用（提示词扫描、模型路由、本地存档）
- Tauri 桌面封装（实验性）
- 多提供商设置（全球、中国区、路由和本地模型）
- Agent Context Pack 原型
- 共享 TypeScript 逻辑包 (packages/shared)
- GitHub Releases CI/CD 工作流

### 实验性/进行中

- 桌面存储路径选择
- 文件类型模型路由规则
- 桌面静态渲染器打包

### 计划中

- MCP 集成
- 高级 OCR 流水线
- 桌面自动更新

## 发布说明

- **v0.3.11** 是当前稳定版本 -- Android APK 已包含在 GitHub Release Assets 中
- **Android APK** 可从 GitHub Releases 下载（v0.3.11 起）
- **Windows/macOS** 桌面安装包仍处于实验阶段
- **iOS** 仅提供源码和自签名构建路径

详见 [docs/RELEASES.md](./docs/RELEASES.md)。

## 后续计划

- [ ] 桌面安装包完善
- [ ] MCP 集成
- [ ] 移动端增强
- [ ] 多语言支持改进

## 作者

TokenFence Studio 由 **Chrisbetheking** 创建并维护。

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE)。