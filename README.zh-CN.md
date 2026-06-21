# TokenFence Studio

**语言:** [English](README.md) | 简体中文

![TokenFence Studio Banner](docs/images/banner.png)

本地优先的 Prompt 安全、文档智能、多模型路由和类 Codex 聊天工作区。
**聊天工作区** | **Prompt 守卫** | **上下文包** | **模型路由** | **Token 预算**

## 概述

TokenFence Studio 是一个 Windows 桌面应用，提供以下功能：

- **安全的 Prompt 输入**：本地文件扫描和 Prompt 守卫，确保敏感信息不会泄露
- **多模型路由**：支持 OpenAI、Anthropic 和本地模型
- **项目上下文打包**：将项目文件打包为上下文，供 LLM 使用
- **聊天工作区**：多模型聊天界面，支持模型切换、文件附件和历史记录
- **模型管理**：已安装模型、模型库、提供商配置、路由规则

## 下载

最新版本：**v1.5.3**

| 平台 | 文件 | 类型 |
|------|-----|-----|
| Windows | [TokenFence-Studio-Windows-v1.5.3-portable.zip](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-Windows-v1.5.3-portable.zip) | 便携版 |

## 系统要求

- **操作系统**：Windows 10/11 (64-bit)
- **运行时**：WebView2 Runtime (通常已预装，如未安装会自动提示)
- **依赖**：无需单独安装 Node.js 或 Python

## 快速开始

1. 下载最新的便携版 ZIP
2. 解压到任意文件夹
3. 运行 TokenFence Studio.exe
4. 配置模型提供商 API Key
5. 开始使用！

## 功能

### Prompt 守卫
自动检测并脱敏敏感信息：身份证号、手机号、邮箱、API Key 等。敏感数据在发送给模型前会自动脱敏。

### 多模型路由
支持配置主模型和备用模型，可设置自动切换策略。支持 OpenAI、Anthropic 和兼容 OpenAI API 的本地模型。

### 项目工作区
打开本地文件夹作为项目，自动索引文件，支持搜索和管理项目上下文。

#### 最近项目
自动记录最近打开的项目，支持固定、收藏和移除操作。固定的项目始终显示在列表顶部。

#### 项目加载
支持手动输入路径加载项目，或从最近项目列表中快速打开。，自动索引文件，支持搜索和管理项目上下文。

### 聊天工作区
多会话聊天界面，支持文件附件、历史记录和模型实时切换。

## 版本历史

### v1.4.3
- 修复项目页面文本编码问题
- 修复敏感数据自动脱敏发送流程
- 更新中英文文档，清除乱码
- 优化项目工作区稳定性

### v1.4.2
- 项目加载流程容错增强
- localStorage 数据损坏自动恢复

### v1.4.0
- 项目工作区最近项目
- 固定和收藏项目
- 持久化活动项目状态

## 开发者

**Chris** — chriswangjob@163.com | 微信: easymoneysniperchris

## 许可证

MIT License

---

[Releases](https://github.com/Chrisbetheking/tokenfence-studio/releases) | [更新日志](CHANGELOG.md) | [English](README.md)
