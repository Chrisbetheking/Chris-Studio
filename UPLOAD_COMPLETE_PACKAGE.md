# Chris Studio v2.0.0 — 原生文件对话框构建修复版

这个包以 GitHub 仓库根目录为内容根，包含 Chris Studio v2.0.0 全量源码、隐藏的 `.github` 工作流，以及本次 macOS 原生构建修复。

## 本次修复

GitHub Actions 日志显示 Rust 后端调用了 `tauri::api::dialog::blocking::FileDialogBuilder`，但 Tauri 的基础 `dialog` Cargo feature 没有被编译进来。这个包已：

- 显式启用 `dialog` 和 `dialog-open`；
- 在 `tauri.conf.json` 中启用 `tauri.allowlist.dialog.open`，防止 Tauri CLI 同步配置时移除对应 feature；
- 在工作流中增加原生对话框配置预检和 `cargo check`；
- 去掉重复执行的前端构建；
- 清理 Rust 未使用的 `Manager` 导入警告；
- 保留 Chris Studio v2.0.0 全部现有功能。

## 一次上传

1. 解压 `Chris_Studio_v2.0.0_COMPLETE_ONE_UPLOAD_NATIVE_DIALOG_FIX.zip`。
2. Finder 按 `Command + Shift + .`，确认 `.github` 文件夹可见。
3. 打开 GitHub 仓库根目录，点击 `Add file → Upload files`。
4. 进入解压后的文件夹，`Command + A` 全选里面所有内容，一次拖入并覆盖。
5. 不要上传 ZIP 本身，也不要把外层文件夹作为仓库子目录。

提交信息：

```text
fix: enable native Tauri dialog APIs for macOS builds
```

## 重新发布

新建一轮工作流，不要 Re-run 旧失败任务：

```text
Actions → Chris Studio macOS Builds and Release → Run workflow
version: v2.0.0
create_release: true
make_latest: true
```

新任务中应先看到：

```text
Verify native dialog build configuration
Check native Rust backend
Build Tauri application
```
