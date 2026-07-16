# TokenFence Studio 中文故障排查

[English](TROUBLESHOOTING.md) | [返回中文 README](../../README.zh-CN.md)

本文档适用于 TokenFence Studio v1.6.1，覆盖桌面端安装、macOS 构建、Provider 配置、系统凭证库和开发环境常见问题。

## 排查前先记录环境

在修改代码前执行：

```bash
node -v
npm -v
rustc --version
cargo --version
```

macOS 还需要执行：

```bash
sw_vers
uname -m
xcode-select -p
```

不要把真实 API Key、密码、私人提示词或客户资料发到日志、截图、GitHub Issue 或聊天中。

## 1. Mac 应该下载哪个版本？

在终端执行：

```bash
uname -m
```

- 输出 `arm64`：下载 `TokenFence-Studio-macOS-Apple-Silicon`。
- 输出 `x86_64`：下载 `TokenFence-Studio-macOS-Intel`。
- Universal 包可同时支持两种架构，但只有可选任务成功时才会提供。

### 出现 “Bad CPU type in executable” 或应用立即退出

安装包架构选错了。删除当前应用，重新下载与芯片匹配的版本。

## 2. macOS 提示无法验证开发者

当前社区构建没有配置 Apple Developer 签名和公证。

第一次启动按以下方式操作：

1. 把应用移动到 `/Applications`。
2. 打开 Finder → 应用程序。
3. 按住 Control 点击 **TokenFence Studio**。
4. 选择 **打开**。
5. 再次确认 **打开**。

不要全局关闭 Gatekeeper。

### 提示“应用已损坏，无法打开”

先完成以下检查：

- 从官方仓库的 Workflow 或 Release 重新下载。
- 使用包内 SHA-256 文件校验下载结果。
- 确认 ZIP 或 DMG 已完整下载并正确解压。

只有在来源和校验值都确认可信之后，开发测试人员才可以仅移除该应用的隔离属性：

```bash
xattr -dr com.apple.quarantine "/Applications/TokenFence Studio.app"
```

不要对来源不可信的应用执行该命令。

## 3. 打开后白屏或空白窗口

按顺序尝试：

1. 完全退出应用后重新打开。
2. 确认应用已经复制到 `/Applications`，不是直接从只读 DMG 窗口运行。
3. 安装当前系统可用的 macOS 更新。
4. 页面能进入时，在 Settings 中重置本地数据。
5. 从终端启动应用，查看不含隐私的错误：

```bash
"/Applications/TokenFence Studio.app/Contents/MacOS/tokenfence-studio"
```

分享日志前必须删除凭证和私人提示词内容。

开发环境先单独验证桌面 UI：

```bash
npm --workspace apps/desktop run ui:build
```

再运行：

```bash
npm run desktop:dev
```

## 4. `npm ci` 失败

### 出现 `npm ERR! ERESOLVE`

使用项目当前兼容参数：

```bash
npm ci --legacy-peer-deps
```

### package-lock 与 package.json 不一致

通常是修改了依赖但没有同步更新锁文件。

在干净分支中执行：

```bash
rm -rf node_modules
npm install --legacy-peer-deps
```

提交前仔细检查 `package-lock.json` 的差异，不要在无关修改中随意重建锁文件。

### Node.js 版本不支持

仓库要求 Node.js 18–22：

```bash
node -v
```

使用 `nvm` 时：

```bash
nvm install 22
nvm use 22
```

## 5. 提示 `tauri: command not found` 或桌面脚本无法运行

在仓库根目录安装完整 workspace 依赖：

```bash
npm ci --legacy-peer-deps
```

不要依赖全局安装的 Tauri CLI，使用项目脚本：

```bash
npm run desktop:dev
```

或者：

```bash
npm run desktop:build
```

## 6. 缺少 Rust 或 Cargo

使用 Rust 官方 rustup 安装器安装，重新打开终端后检查：

```bash
rustc --version
cargo --version
```

添加特定 macOS 架构目标：

```bash
rustup target add aarch64-apple-darwin
rustup target add x86_64-apple-darwin
```


## 7. 缺少 Xcode Command Line Tools

执行：

```bash
xcode-select --install
```

确认路径：

```bash
xcode-select -p
```

完整 Xcode 更新后路径失效，并且 Xcode 确实安装在默认位置时，可执行：

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
```

## 8. Mac 本地构建失败

在仓库根目录运行：

```bash
bash scripts/build-macos.sh
```

结果目录：

```text
apps/desktop/src-tauri/target/<target>/release/bundle/
```

重新构建前，先分别验证桌面 UI：

```bash
npm --workspace apps/desktop run typecheck
npm --workspace apps/desktop run test:core
npm --workspace apps/desktop run ui:build
```

检查 Rust 后端：

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 9. GitHub Actions 中找不到 Mac 构建任务

确认所选分支存在：

```text
.github/workflows/tokenfence-macos.yml
```

然后进入：

```text
GitHub → Actions → TokenFence macOS Builds and Release → Run workflow
```

如果仓库禁用了 Actions，需要先在仓库 Settings 中启用。

## 10. GitHub Actions 在 Mac 构建前就失败

工作流会先运行 `Verify desktop UI`，这是有意设计的。打开失败任务，找到第一个报错命令。

本地复现：

```bash
npm ci --legacy-peer-deps
npm --workspace apps/desktop run typecheck
npm --workspace apps/desktop run test:core
npm --workspace apps/desktop run ui:build
python3 scripts/verify_tokenfence_patch.py
```

应该修复第一个真实错误，而不是反复点击重新运行。

## 11. Apple Silicon 成功，但 Intel 构建失败

两个任务使用不同的 Runner 架构和 Rust target。重点检查：

- 某个依赖只支持 arm64；
- 下载了错误架构的原生二进制；
- 缺少 `x86_64-apple-darwin`；
- Runner 镜像或第三方 Action 不兼容。

当前工作流使用 GitHub 的 `macos-15-intel` 标签。如果 GitHub 调整 Runner 可用性，需要对照 GitHub 最新托管 Runner 文档检查标签。

## 12. Universal 失败，但两个单架构版本成功

Universal 是可选任务。它要求两个 Rust macOS target 同时存在，而且所有原生依赖都能合并双架构。

Apple Silicon 和 Intel 单独安装包仍可正常发布，不应仅因为可选 Universal 失败而阻塞版本。

## 13. Artifact 中没有 `.dmg` 或 `.app.zip`

打开工作流中的 `Package artifacts` 步骤。脚本期望 Tauri 在以下目录生成文件：

```text
apps/desktop/src-tauri/target/<target>/release/bundle/macos/
apps/desktop/src-tauri/target/<target>/release/bundle/dmg/
```

检查：

- Tauri bundle 是否启用；
- `bundle.targets` 是否禁用了 `app` 或 `dmg`；
- Tauri build 是否真正成功；
- 产品名称是否导致输出目录与脚本预期不同。

## 14. DeepSeek 提示未保存凭证

进入 **Providers**，重新输入 Key 并保存，确认界面显示凭证已存储。

macOS 可以打开“钥匙串访问”，搜索：

```text
com.tokenfence.studio
```

测试时不要显示或复制真实值。

如果你只是在浏览器或 Vite 预览中运行，系统钥匙串不可用，必须启动原生 Tauri 应用。

## 15. 重启后 API Key 消失

逐项检查：

1. 应用是否运行在原生桌面环境中。
2. macOS 是否拒绝了钥匙串访问。
3. 关闭应用前是否已完成保存。
4. 钥匙串中是否存在 `com.tokenfence.studio`。
5. 当前是否换成了另一个 macOS 用户账号。

在 Settings 中清除 Provider 凭证，重新保存后再次测试连接。

## 16. 无法清除 Provider 凭证

使用：

```text
Settings → Privacy → Clear provider credential
```

macOS 上仍失败时，打开“钥匙串访问”，搜索 `com.tokenfence.studio`，确认项目确实属于 TokenFence Studio 后手动删除。

不要删除其他无关的钥匙串项目。

## 17. DeepSeek 测试连接失败

根据错误类别排查：

### 凭证无效或 401

- Key 为空、已撤销、复制不完整，或者不是该服务的 Key。
- 在 Providers 中重新保存正确凭证。

### Forbidden 或 403

- 账号、地区、项目或接口权限可能不允许请求。
- 检查 Provider 账号和官方服务可用性。

### Rate limited 或 429

- 请求频率或账户额度达到限制。
- 等待后重试，检查用量，或者使用仍有额度的账号。

### Model not found、400 或 404

- 当前账户或接口不接受所选模型。
- 改用应用界面列出的受支持模型后重试。

### Timeout 或网络错误

- 检查网络、VPN/代理、防火墙、DNS 和系统时间。
- 只有明确确认网络较慢时，才在 Settings 中适当增加超时时间。

### `DESKTOP_RUNTIME_REQUIRED`

当前是在浏览器预览中调用。Provider 请求只能在 Tauri 原生桌面应用中运行。

### Demo Mode 正常，但真实 Provider 失败

Demo Mode 不发送网络请求，只能证明本地 UI 和安全流程能够运行，不能证明真实 DeepSeek 已连接。

## 18. 已经批准过，提示词为什么又被阻止？

以下变化会主动使旧批准失效：

- 修改提示词；
- 增加、删除或替换附件；
- 修改相关安全设置。

重新扫描并审查新的脱敏内容即可。

## 19. 附件被忽略或无法扫描

当前安全流程主要面向支持的文本内容。二进制文件、图片、加密压缩包和不支持的格式可能无法检查。

- 把相关内容转换成支持的文本格式。
- 上传前手动删除秘密信息。
- 不要默认认为“不支持的文件已经扫描过”。

同时检查 Settings 中的最大附件扫描大小。

## 20. 扫描出现误报

不要立即关闭全部安全功能。

- 查看具体风险类型。
- 替换或改写测试值。
- 调整用户自定义敏感词。
- 公开演示时建议保持严重风险阻断。
- 反馈检测问题时，只提交脱敏、虚构的最小复现案例。

## 21. 本地历史没有保存

检查：

```text
Settings → Privacy → Local history enabled
```

只有启用后才会保存脱敏会话。重置应用或清空会话会删除本地历史。

## 22. 语言或主题没有更新

1. 在 Settings 修改选项。
2. 点击 **Save settings/保存设置**。
3. 应用运行期间修改系统主题后，可以重启应用。
4. 设置数据损坏时，先导出不含凭证的配置，再使用 **Reset application/重置应用**。

## 23. 安全重置应用

使用：

```text
Settings → Advanced → Reset application
```

这会删除本地设置、凭证、历史和安全回执。需要保留配置时先导出。导出文件不会包含原始 Provider Key。

## 24. 反馈 Bug 时应该提供什么？

可以提供：

- TokenFence Studio 版本；
- 操作系统版本；
- CPU 架构；
- 安装来源：Release 或 Actions Artifact；
- 完整但不含敏感信息的错误提示；
- 最小复现步骤；
- Demo Mode 是否正常；
- CI 中第一个失败步骤。

绝对不要提供：

- API Key；
- 密码；
- 完整私人提示词；
- 客户文档；
- 未脱敏的环境变量文件；
- 能显示凭证值的钥匙串截图。

---

## 20. 构建成功，但 GitHub Releases 没有更新

通常是因为工作流只上传了 Actions Artifact，或者运行时关闭了 `create_release`。

请进入：

```text
GitHub → Actions → TokenFence macOS Builds and Release → Run workflow
```

设置：

```text
version: v1.6.1
create_release: true
make_latest: true
```

然后确认 **Create or update GitHub Release** 任务成功。只提交源码、只生成 Actions Artifact，都不会自动更新 Releases 页面。

## 21. README 里的直接下载链接返回 404

`releases/latest/download/...` 链接只有在以下条件全部满足后才会生效：

1. v1.6.1 Release 已创建；
2. v1.6.1 被标记为 Latest；
3. 对应文件名已经附加到 Release Assets。

请打开 Release 的 Assets 列表，逐字核对安装包文件名和 README 链接是否完全一致。
