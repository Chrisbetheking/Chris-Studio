# TokenFence Studio

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

面向大语言模型的本地优先 AI 工作台，包含类似 Codex 的聊天界面、Prompt 防护、上下文包、模型路由和 Token 预算。

**聊天工作台** | **Prompt 防护** | **上下文包** | **模型路由** | **Token 预算**

## 最新下载

- [Android APK](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.0/TokenFence-Studio-Android-v1.0.0-release.apk)
- [Windows 便携版 ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.1.8/TokenFence-Studio-Windows-v1.1.8-portable.zip)

> Windows 用户：请下载 portable ZIP，先完整解压，再运行解压文件夹里的 `tokenfence-studio.exe`。不要直接在 ZIP 压缩包预览里双击 EXE。

[Releases](https://github.com/Chrisbetheking/tokenfence-studio/releases) | [更新日志](CHANGELOG.md) | [English](README.md)

---

## 项目简介

TokenFence Studio 是一个本地优先 AI 工作台，默认提供类似 Codex 的聊天工作界面。

它可以帮助用户处理 Prompt、文件、上下文包、模型路由、Token 预算和多提供商 AI 工作流。

## 已包含功能

- 类 Codex 聊天工作台
- 文件附加与上下文包
- Agent 任务状态区
- Prompt 防护集成
- Token 预算 / Token 计算器
- 模型配置状态标识
- 自定义模型 ID 和别名
- 按文件类型进行模型路由
- Provider Hub
- 输出生成
- 英文 / 简体中文界面

## 功能矩阵

| 领域 | 能力 | 状态 |
|---|---|---|
| 聊天工作台 | 侧边栏、对话列表、输入框、检查器 | 可用 |
| 文件附加 | 附加文本文件并加入上下文包 | 可用 |
| 上下文包 | 文件、字符数、估算 tokens、上下文摘要 | 可用 |
| Agent 任务 | 空闲、扫描、准备、等待、响应、完成 | 可用 |
| Prompt 防护 | 扫描用户输入并显示防护结果 | 可用 |
| Token 预算 | 估算输入、文件、消息和总 tokens | 可用 |
| 模型状态 | 绿色/灰色/黄色/红色状态标识 | 可用 |
| 模型路由 | 按文件类型和上下文规则路由 | 可用 |
| Provider Hub | OpenAI、Claude、Gemini、DeepSeek、Qwen、Kimi、Doubao、Zhipu、Ollama、LM Studio、Custom | 可用，需配置 Key |
| 工具箱 | 插件、输出、媒体、计算机使用入口 | 预览 |
| 项目 | 项目工作区入口 | 即将推出 |
| 设置 | 配置入口 | 即将推出 |

## 已验证工作流

1. 从 portable ZIP 启动桌面端
2. 默认进入类 Codex 聊天工作台
3. 文件附加入口
4. 上下文包显示
5. Agent 任务状态显示
6. Prompt 防护结果显示
7. Token 预算显示
8. 模型状态标识
9. 文件类型路由提示
10. 本地会话持久化

## Windows 使用方式

下载 `TokenFence-Studio-Windows-v1.1.8-portable.zip`，先完整解压，再运行解压文件夹里的 `tokenfence-studio.exe`。

不要直接在 ZIP 压缩包预览里双击 EXE。

## 已知限制

- Windows 构建暂未签名，仍为实验版。
- Provider 调用需要用户自行配置 API Key。
- Android APK 沿用此前已验证的 Mobile Lite 构建。
- 暂不包含 macOS。
- 部分工具箱功能标记为预览。
- 项目和设置页面仍在扩展中。

## 许可证

MIT License
