# TokenFence Studio

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

![TokenFence Studio Banner](docs/images/banner.png)

本地优先 AI 工作台，包含类似 Codex 的聊天界面、Prompt 防护、上下文包、模型中心、智能路由、项目上下文和 Token 预算。

**聊天工作台** | **Prompt 防护** | **上下文包** | **模型中心** | **智能路由** | **Token 预算**

## 最新下载

- [Android APK](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.0/TokenFence-Studio-Android-v1.0.0-release.apk)
- [Windows 便携版 ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/download/v1.0.11/TokenFence-Studio-Windows-v1.0.11-portable.zip)

> Windows 用户：请下载 portable ZIP，先完整解压，再运行解压文件夹里的 `tokenfence-studio.exe`。不要直接在 ZIP 压缩包预览里双击 EXE。

[Releases](https://github.com/Chrisbetheking/tokenfence-studio/releases) | [更新日志](CHANGELOG.md) | [English](README.md)

---

## 项目简介

TokenFence Studio 是一个本地优先 AI 工作台，用于 Prompt 安全、模型路由、文件上下文、项目上下文和多提供商 AI 工作流。

它提供类似 Codex 的聊天工作台，支持文件附加、上下文包、模型能力路由、Token 预算、Provider 配置和项目文件上下文。

## 已包含功能

- 类 Codex 聊天工作台
- 文件附加与上下文包
- 项目工作区与项目文件上下文
- Agent 任务状态区
- Prompt 防护集成
- Token 预算与 Token 计算器
- 模型中心与提供商/模型预设
- 可搜索的厂商优先模型选择器
- 模型配置状态标识
- 自定义模型 ID 与别名
- 按文件类型进行智能模型路由
- Provider API Key 配置
- 桌面运行时 Provider 连接测试
- 工具箱状态标签
- 英文 / 简体中文界面

## 功能矩阵

| 领域 | 能力 | 状态 |
|---|---|---|
| 聊天工作台 | 侧边栏、对话列表、输入框、检查器 | 可用 |
| 文件附加 | 附加文件并加入上下文包 | 可用 |
| 上下文包 | 文件、字符数、估算 tokens、上下文摘要 | 可用 |
| 项目 | 项目记录、桌面端项目扫描、选中文件上下文 | 桌面端可用 |
| 设置 | 通用、Provider、模型路由、隐私设置 | 可用 |
| Provider 测试 | 通过桌面运行时进行健康检查 | 桌面端可用 |
| Agent 任务 | 步骤状态与工作流状态 | 部分可用 |
| Prompt 防护 | 扫描用户输入并显示防护结果 | 可用 |
| Token 预算 | 估算输入、文件、消息和总 tokens | 可用 |
| 模型中心 | Provider / 模型注册表与状态 | 可用 |
| 模型选择器 | 厂商优先的模型浏览与搜索 | 可用 |
| 模型路由 | 按文件类型和模型能力路由 | 可用 |
| 自定义模型 | 自定义模型 ID 和别名 | 可用 |
| 工具箱 | 插件、输出、媒体、计算机使用入口 | 预览 / 部分可用 |
| Android | 沿用 Mobile Lite 构建 | Mobile Lite |
| macOS | 暂未包含 | 暂未包含 |
| Windows 签名 | 桌面端暂未签名 | 未签名实验版 |

## Windows 使用方式

下载 `TokenFence-Studio-Windows-v1.0.11-portable.zip`，先完整解压，再运行解压文件夹里的 `tokenfence-studio.exe`。

不要直接在 ZIP 压缩包预览里双击 EXE。

## 已知限制

- Windows 构建暂未签名，仍为实验版。
- Provider 调用需要用户自行配置 API Key。
- 项目扫描和 Provider 健康检查需要桌面运行时。
- 部分 Provider 的模型 ID 可能需要手动微调。
- Android APK 沿用 Mobile Lite 构建。
- 暂不包含 macOS。
- 部分工具箱功能仍为预览或部分可用。
- Agent 执行仍为部分能力，完整文件修改和 diff 工作流属于后续迭代。

## 许可证

MIT License
