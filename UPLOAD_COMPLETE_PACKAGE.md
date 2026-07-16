# Chris Studio v2.1.0 一次上传说明

1. 解压 ZIP。
2. Finder 按 `Command + Shift + .`，确认 `.github` 可见。
3. 打开 GitHub 仓库根目录，选择 **Add file → Upload files**。
4. 进入解压后的目录，`Command + A` 全选目录内部所有内容并一次拖入。
5. 不要把 ZIP 或外层文件夹本身上传到仓库。

提交信息：

```text
feat: ship Chris Studio v2.1.0 unified agent workspace
```

上传后 GitHub Actions 应出现：

- `Chris Studio CI`
- `Chris Studio macOS Builds and Release`
- `Legacy release workflow (manual notice only)`

运行 macOS 发布：

```text
Actions
→ Chris Studio macOS Builds and Release
→ Run workflow
→ version: v2.1.0
→ create_release: true
→ make_latest: true
```

不要重新运行旧版失败任务。
