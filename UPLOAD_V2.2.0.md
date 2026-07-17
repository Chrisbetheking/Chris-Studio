# Chris Studio v2.2.0 增量包上传说明

本 ZIP 只包含 v2.2.0 本次新增或需要覆盖的文件，并保持 GitHub 仓库原有目录结构。

## 上传

1. 解压 ZIP。
2. Finder 按 `Command + Shift + .`，确认 `.github` 可见。
3. 打开 GitHub 仓库根目录，选择 **Add file → Upload files**。
4. 进入解压后的目录，`Command + A` 全选目录内部所有内容，一次拖入仓库根目录覆盖。
5. 不要上传 ZIP 本身，也不要把外层文件夹作为仓库子目录。

建议提交信息：

```text
feat: ship v2.2.0 reliable agent runtime and release pipeline
```

## 新建发布任务

不要对旧失败任务点击 `Re-run jobs`。进入：

```text
Actions
→ Chris Studio macOS Builds and Release
→ Run workflow
```

填写：

```text
version: v2.2.0
create_release: true
make_latest: true
```

新任务应按顺序出现版本一致性检查、UI 检查、Rust 检查、Apple Silicon/Intel 构建、资源核验、逐资产发布重试和远端资源核验。
