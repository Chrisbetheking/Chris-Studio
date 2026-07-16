# TokenFence Studio

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)  
**帮助：** [中文故障排查](docs/troubleshooting/TROUBLESHOOTING.zh-CN.md) | [English troubleshooting](docs/troubleshooting/TROUBLESHOOTING.md)

![TokenFence Studio Banner](docs/images/banner.png)

> 位于提示词、文件与 AI Provider 之间的一道本地优先安全防线。

TokenFence Studio 是一款桌面 AI 安全工作台。它会在请求发送给 AI Provider **之前**，统一审查提示词和支持的文本附件，识别潜在敏感信息，生成脱敏后的待发送内容，明确展示发送目标，并尽可能降低敏感信息被意外提交和落盘的风险。

**安全工作区** · **Prompt Guard** · **附件审查** · **DeepSeek Provider** · **本地历史** · **macOS 钥匙串**

## 下载 TokenFence Studio

### macOS v1.6.1

| Mac 类型 | 推荐下载 | 备用下载 |
|---|---|---|
| Apple Silicon：M1/M2/M3/M4 及后续芯片 | [下载 Apple Silicon DMG](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-macOS-Apple-Silicon.dmg) | [下载 APP ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-macOS-Apple-Silicon.app.zip) |
| Intel Mac | [下载 Intel DMG](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-macOS-Intel.dmg) | [下载 APP ZIP](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/TokenFence-Studio-macOS-Intel.app.zip) |

- [打开最新 GitHub Release](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest)
- [打开 v1.6.1 Release 页面](https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v1.6.1)
- [Apple Silicon SHA-256 校验文件](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/SHA256SUMS-Apple-Silicon.txt)
- [Intel SHA-256 校验文件](https://github.com/Chrisbetheking/tokenfence-studio/releases/latest/download/SHA256SUMS-Intel.txt)

> 在 **v1.6.1 GitHub Release 创建完成且对应安装包上传完成之前**，直接下载链接会返回 `404`。只上传仓库源码或只在 Actions 中生成 Artifact，不会自动更新 Releases 页面。

在 Mac 终端执行以下命令确认芯片架构：

```bash
uname -m
```

- `arm64`：Apple Silicon。
- `x86_64`：Intel。

### 旧版 Windows 下载

- [TokenFence Studio v1.5.6 Release](https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v1.5.6)

当前 v1.6.1 发布工作流优先发布新的 macOS 安装包。Windows 和 Android 可以在后续统一多平台发布工作流中补到同一个 Release。

## 当前版本

当前桌面端版本线为 **v1.6.1**。

- 支持 Apple Silicon 与 Intel Mac 的原生 macOS 构建
- DeepSeek 凭证保存到操作系统凭证库
- 中英文界面
- 跟随系统、浅色和深色主题
- 无需 API Key 的 Demo Mode
- 仅保存脱敏内容的本地会话与安全回执

> v1.6.1 社区 macOS 构建目前未配置 Apple Developer 签名与公证。第一次启动时，可能需要在 Finder 中按住 Control 点击应用并选择 **打开**。不要全局关闭 Gatekeeper。

## 为什么需要 TokenFence Studio

使用 AI 处理真实工作时，提示词里经常会混入终端日志、源代码、配置文件、账号标识、邮箱、接口地址和 API Key。普通聊天界面在用户点击发送后就会直接提交内容，而 TokenFence Studio 会在用户与 Provider 之间增加一次明确的安全审查：

```text
提示词 + 支持的文本附件
             ↓
        本地安全扫描
             ↓
     风险分类与问题类型
             ↓
      待确认的脱敏内容
             ↓
        用户确认后发送
             ↓
       明确的 Provider 请求
```

项目目标不是承诺绝对不会漏检，而是让意外泄露更难发生、更容易被发现，也更便于用户检查。

## 核心功能

### 发送前 Prompt Guard

- 在批准发送前扫描当前提示词
- 识别常见凭证和个人标识
- 支持自定义敏感词
- 展示风险等级和问题类型，不暴露完整密钥
- 提示词修改后自动撤销旧批准

### 提示词与附件统一审查

- 提示词和支持的文本附件进入同一套安全流程
- 增加或删除附件后自动撤销旧批准
- 开启阻断后，Critical 原始内容不能绕过已审查版本直接发送
- 支持文本和文件扫描大小限制

### 原生凭证保护

- macOS：凭证保存到 **Keychain 钥匙串**
- Windows：凭证保存到操作系统凭证库
- 新写入的 Provider Key 不保存到浏览器 `localStorage`
- 在条件允许时迁移并删除旧版本遗留的本地明文凭证

### 安全本地历史

- 开启本地历史后保存脱敏会话
- 安全回执只保存元数据，不保存完整敏感原文
- 会话落盘前再次扫描，形成防御性存储边界
- 支持清除会话、安全回执、凭证或全部应用状态

### DeepSeek Provider 工作区

- 可配置 DeepSeek 模型与官方基础地址
- 测试连接时显示可理解的错误分类
- Provider 请求通过 Tauri 桌面后端发出
- Demo Mode 无需 API Key，也不会发送网络请求

### 桌面体验

- Workspace、History、Providers、Settings 和 About 页面
- macOS 原生应用菜单
- macOS 下使用 `Command + N` 新建安全会话
- 展示运行平台、CPU 架构、应用版本和安全存储信息
- 中英文界面
- 跟随系统、浅色和深色主题

## 用户快速上手

### macOS 安装

1. 从上面的下载链接选择对应芯片的 `.dmg`。
2. 打开 DMG，把 **TokenFence Studio** 拖到 **Applications/应用程序**。
3. 未签名版本第一次启动时，在 Finder 中按住 Control 点击应用并选择 **打开**。
4. 打开 **Providers**，可以先开启 Demo Mode，或者把 DeepSeek API Key 保存到钥匙串。
5. 返回 **Workspace**，输入测试内容，检查扫描结果并确认安全版本。

公开演示时不要使用真实密钥，只能使用明显虚构的测试内容。

### Windows 安装

1. 打开旧版 Windows Release 页面。
2. 下载 Windows portable ZIP。
3. 完整解压 ZIP。
4. 在解压目录中运行 `tokenfence-studio.exe`。

不要直接在 ZIP 预览窗口里运行 EXE。

## 开发环境

### 环境要求

- Node.js `18`–`22`
- npm `9` 或更高版本
- 原生桌面开发需要 Rust stable
- macOS 构建需要 Xcode Command Line Tools

### 克隆与安装

```bash
git clone https://github.com/Chrisbetheking/tokenfence-studio.git
cd tokenfence-studio
npm ci --legacy-peer-deps
```

### 运行网页工作区

```bash
npm run dev
```

打开 Vite 输出的本地地址，通常是 `http://localhost:3000`。

### 只运行桌面 UI

```bash
npm --workspace apps/desktop run ui:dev
```

这种方式适合修改界面，但 Provider 原生请求和钥匙串能力需要 Tauri 桌面运行环境。

### 运行原生桌面应用

```bash
npm run desktop:dev
```

### 构建桌面应用

```bash
npm run desktop:build
```

### 在 Mac 本机生成安装包

```bash
bash scripts/build-macos.sh
```

构建结果位于：

```text
apps/desktop/src-tauri/target/<target>/release/bundle/
```

## 通过 GitHub Actions 发布 v1.6.1

新版工作流支持在一次手动运行中完成 **构建 + 创建 Release + 上传安装包**。

1. 把本覆盖包上传到仓库根目录，必须包含隐藏的 `.github` 目录。
2. 打开 **Actions → TokenFence macOS Builds and Release**。
3. 点击 **Run workflow**。
4. `version` 填写 `v1.6.1`。
5. 保持 `create_release` 和 `make_latest` 开启。
6. 分支选择 `main` 后运行。
7. Apple Silicon 和 Intel 构建成功后，打开仓库 **Releases** 页面。

Release 任务会创建或更新 `v1.6.1` 标签，在选中时将其标记为 Latest，并上传 `.dmg`、`.app.zip` 和 SHA-256 文件。Universal 是可选构建，即使失败也不会阻止两个必需架构的安装包发布。

## 配置 DeepSeek

1. 打开 **Providers**。
2. 除非正在进行明确的开发测试，否则保留应用提供的官方基础地址。
3. 选择界面中支持的模型。
4. 输入 API Key，并保存到系统凭证库。
5. 点击 **测试连接**。
6. Provider 状态显示连接成功后，返回 Workspace 使用。

界面会在本地保存 Provider 的非敏感配置，但原始 API Key 会通过桌面端原生凭证库保存。

## Demo Mode

Demo Mode 适合比赛截图、产品演示、评审体验和离线测试。

- 不需要 Provider API Key。
- 不会发送网络请求。
- 保留完整的扫描、脱敏、确认和安全回执流程。
- 只能使用虚构的邮箱、Token 和密码示例。

Demo Mode 成功不代表真实 Provider 已经连接。真实 DeepSeek 配置必须通过 **测试连接** 验证。

## 隐私与安全设计

TokenFence Studio 遵循以下原则：

1. 提示词和支持的文本附件在发送前先审查。
2. 始终明确展示当前 Provider 和模型。
3. 内容发生相关变化后必须重新批准。
4. Provider 密钥保存到操作系统凭证库。
5. 本地历史保存脱敏内容，而不是检测到的敏感原文。
6. 调试输出中不打印完整 Provider 密钥和未脱敏请求。

### 重要限制

- 基于规则和模式的扫描可能漏掉未知或非常规格式的敏感信息。
- 自动脱敏后的内容仍然需要用户人工检查。
- 二进制文件、图片、加密压缩包和不支持的格式可能无法被检查。
- 用户批准发送后，第三方 Provider 如何处理数据不受本应用控制。
- 当前社区版 macOS 安装包未经过 Apple 签名和公证。
- TokenFence Studio 不能替代企业 DLP、终端安全、权限控制以及法律或合规审查。

## 验证命令

在仓库根目录执行：

```bash
npm ci --legacy-peer-deps
npm --workspace apps/desktop run typecheck
npm --workspace apps/desktop run test:core
npm --workspace apps/desktop run ui:build
python3 scripts/verify_tokenfence_patch.py
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 项目结构

```text
apps/
├── web/
├── desktop/
│   ├── ui/
│   └── src-tauri/
└── android/
packages/
└── shared/
scripts/
├── build-macos.sh
└── verify_tokenfence_patch.py
docs/
├── release/
└── troubleshooting/
.github/workflows/
├── tokenfence-macos.yml
└── tokenfence-v1.6-verify.yml
```

## 遇到问题

- [中文故障排查](docs/troubleshooting/TROUBLESHOOTING.zh-CN.md)
- [English troubleshooting](docs/troubleshooting/TROUBLESHOOTING.md)

## 后续规划

- Apple Developer 签名与公证
- 将 Windows v1.6.x 安装包加入统一 Release 工作流
- 更多 Provider 接入
- 自定义安全规则和团队策略
- 文档级风险位置定位
- Token 与成本对比
- Agent 工具调用审查

## 开源协议

MIT License。
