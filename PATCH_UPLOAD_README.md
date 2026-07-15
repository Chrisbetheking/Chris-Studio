# TokenFence Studio v1.6.0 — GitHub 网页覆盖包

这个 ZIP 不是完整仓库，而是已经按仓库路径排好的“覆盖补丁”。解压后，把里面的文件和文件夹直接拖进 GitHub 仓库根目录并确认覆盖同名文件。

## 上传方式

1. 打开 `Chrisbetheking/tokenfence-studio` 的 `main` 分支。
2. 点击 **Add file → Upload files**。
3. 解压本 ZIP，把解压后目录中的全部内容拖入上传区。必须保留 `apps/...`、`.github/...`、`docs/...` 的目录层级；macOS 看不到 `.github` 时可按 `Command + Shift + .` 显示隐藏文件。
4. 提交信息填写：`feat: ship TokenFence Studio v1.6.0 safe workspace`
5. 提交后打开 **Actions → TokenFence v1.6 verification**，确认前端 build 与 Rust cargo check 均通过。

## 本次会覆盖的核心文件

- `apps/desktop/package.json`
- `apps/desktop/ui/src/App.tsx`
- `apps/desktop/ui/src/main.tsx`
- `apps/desktop/ui/src/index.css`
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/tauri.conf.json`

并新增安全扫描、Provider 客户端、工作台、历史、设置、关于页等模块。

## 连接 DeepSeek

1. 启动桌面端，进入 **Providers**。
2. 填写 API Key。
3. 选择 `deepseek-v4-flash` 或 `deepseek-v4-pro`。
4. 点击 **Test connection**。
5. 显示 Connected 后返回 Workspace。

浏览器单独打开 Vite 页面不能执行真实 Provider 请求；真实请求必须在 Tauri 桌面运行时中通过 Rust 后端发出。

## 重要隐私说明

当前 API Key 保存在应用的本地存储中，并通过 Tauri 后端调用 DeepSeek。此版本没有声称使用 Windows Credential Manager 或系统钥匙串加密。历史记录只保存脱敏后的请求；安全回执只保存风险类型、Provider、模型、文件名等元数据。

## 已完成的本地验证

- TypeScript strict：通过
- Vite production build：通过（40 modules）
- Core privacy tests：通过
- Rust source syntax parse：通过
- ZIP 完整性与敏感信息静态扫描：通过

完整记录见 `docs/competition/VERIFICATION_REPORT_v1.6.0.md`。完整 Cargo/Windows 构建由上传后 GitHub Actions 执行。
