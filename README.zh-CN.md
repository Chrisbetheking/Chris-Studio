# TokenFence Studio

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

本地优先的 Prompt 安全、文档智能、多模型路由与 Codex 风格对话工作区，面向大语言模型。

**对话工作区** | **Prompt Guard** | **上下文包** | **模型路由** | **Token 预算**

## 最新下载

- [Android APK](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.0/TokenFence-Studio-Android-v1.0.0-release.apk)
- [Windows 便携版 ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.10/TokenFence-Studio-Windows-v1.0.10-portable.zip)

> Windows 用户：请下载 portable ZIP，先完整解压，再运行解压文件夹里的 tokenfence-studio.exe。不要直接在 ZIP 压缩包预览里双击 EXE。

[Releases](https://github.com/Chrisbetheking/tokenfence-studio/releases) | [更新日志](CHANGELOG.md) | [English](README.md)

---

## 概述

TokenFence Studio 是一个本地优先的 AI 工作区，配备 Codex 风格对话界面。

帮助用户处理 Prompt、文件、上下文包、模型路由、Token 预算以及基于提供商的 AI 工作流。

## 包含内容

- Codex 风格对话工作区
- 文件附加与上下文包
- Agent 任务状态区
- Prompt Guard 集成
- Token 预算 / Token 计算器
- 模型配置状态指示器
- 自定义提供商模型别名
- 基于文件类型的模型路由
- Provider Hub
- 输出生成
- 英文 / 简体中文界面

## 功能矩阵

| 区域 | 功能 | 状态 |
|---|---|---|
| 对话工作区 | 侧边栏、对话列表、输入框、检查器 | 工作中 |
| 文件附加 | 附加文本文件并加入上下文包 | 工作中 |
| 上下文包 | 文件、字符数、预估 Token、上下文摘要 | 工作中 |
| Agent 任务 | 空闲、扫描中、准备中、等待中、响应中、完成 | 工作中 |
| Prompt Guard | 扫描用户输入并显示防护结果 | 工作中 |
| Token 预算 | 估算输入、文件、消息和总 Token | 工作中 |
| 模型状态 | 绿/灰/黄/红 提供商状态 | 工作中 |
| 模型路由 | 按文件类型和上下文规则路由 | 工作中 |
| Provider Hub | OpenAI、Claude、Gemini、DeepSeek、通义千问、Kimi、豆包、智谱、Ollama、LM Studio、自定义 | 工作中；需配置 Key |
| 工具箱 | 插件/输出/媒体/计算机使用入口 | 预览 |
| 项目 | 项目工作区入口 | 工作中 |
| 设置 | 配置入口 | 工作中 |

## 已验证工作流

1. 从 portable ZIP 启动桌面版
2. Codex 风格对话工作区为默认页面
3. 文件附加入口
4. 上下文包显示
5. Agent 任务状态显示
6. Prompt Guard 结果显示
7. Token 预算显示
8. 模型状态指示器
9. 基于文件类型的路由提示
10. 本地对话持久化

## Windows 使用说明

下载 TokenFence-Studio-Windows-v1.0.10-portable.zip，先完整解压，再运行解压文件夹里的 tokenfence-studio.exe。

不要直接在 ZIP 压缩包预览里双击 EXE。

## 已知限制

- Windows 版本为未签名的实验性构建。
- 提供商调用需要用户自行配置 API Key。
- Android APK 沿用之前已验证的 Mobile Lite 构建。
- 不包含 macOS 版本。
- 部分工具箱功能标记为预览。
- 项目和设置页面仍在持续完善中。

## 许可证

MIT License
