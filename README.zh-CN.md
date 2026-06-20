# TokenFence Studio

**语言:** [English](README.md) | [中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

本地优先— Prompt 安全、文档智能、多模型路由和类 Codex 聊天工作区，专为大语言模型 (LLM) 设计。
**聊天工作区** | **Prompt 守卫** | **上下文包** | **模型路由** | **Token 预算**

## 概述

TokenFence Studio 是一。Windows 桌面应用，提供以下功能：

- **安全— Prompt 输入**：本地文件扫描和 Prompt 守卫，确保敏感信息不会泄。- **多模型路区**：支。OpenAI、Anthropic 和本地模。- **项目上下文打区**：将项目文件打包为上下文，供 LLM 使用
- **聊天工作区**：多模型聊天界面，支持模型切换、文件附件和历史记录
- **模型管理**：已安装模型、模型库、提供商配置、路由规。
## 下载

最新版本：**v1.3.9**

| 平台 | 文件 | 类型 |
|------|------|------|
| Windows | [TokenFence-Studio-Windows-v1.4.2-portable.zip](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-Windows-v1.4.2-portable.zip) | 便携。|

## 系统要求

- **操作系统**：Windows 10/11 (64-bit)
- **运行区**：WebView2 Runtime (通常已预装，如未安装会自动提。
- **依赖**：无需单独安装 Node.js 。Python

## 快速开。
1. 下载最新的 portable ZIP 。2. 解压到任意文件夹（如 `E:\Apps\TokenFenceStudio`。3. 运行 `TokenFence Studio.exe`
4. （可选）右键 exe 发送到桌面创建快捷方式

## 功能详解

### 聊天工作。
多模型聊天界面，支持。
- 模型切换（在已配置模型之间切换）
- 文件附件（附加文件作为上下文。- Prompt 守卫（Prompt Guard。- 上下文包（Context Pack。- Chat 。Project 两个视图

### 模型管理

模型页面提供四个切换栏：

- **已添加模区**：查看和管理已配置的模型，包括模型状态和 API Key 配置
- **模型区**：浏览可用模型，按提供商分类
- **提供区**：配。API 提供商（OpenAI、Anthropic 等）。API Key
- **路由**：管理模型路由规。
### 项目

创建和管理项目，组织聊天对话和项目文件。
### 工具。
开发者工具集，包括：

- 文件扫描：扫描文件夹中的敏感信息
- Token 计算器：计算文本。Token 数量

### Agent 补丁

创建和管理可复用。Agent 配置，包括系统提示词、模型选择和工具配置。
## 开。
本项目使。Tauri (Rust) + React (TypeScript) 构建。
### 先决条件

- Node.js 18+
- Rust 工具。(rustup, cargo)
- Windows SDK

### 构建步骤

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm install --legacy-peer-deps
npm run desktop:build
```

构建产物位于 `apps/desktop/src-tauri/target/release/`。
### 项目结构

```
tokenfence-studio/
  apps/
    desktop/           # Tauri 桌面应用
      ui/              # React 前端
      src-tauri/       # Rust 后端
    web/               # Web 应用 (Next.js)
  packages/
    shared/            # 共享类型和工。  scripts/             # 构建和发布脚。```

## 许可。
[MIT](LICENSE)

## 致谢

基于 [Tauri](https://tauri.app/) 。[React](https://react.dev/) 构建。