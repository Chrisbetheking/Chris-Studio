# v1.7.1 一次上传说明

1. 解压本 ZIP。
2. Finder 按 `Command + Shift + .`，确认 `.github` 可见。
3. 进入 GitHub 仓库根目录，选择 **Add file → Upload files**。
4. 将解压目录中的全部内容一次性拖入并覆盖。
5. 提交信息：

```text
fix: restore secure provider credential hydration in v1.7.1
```

6. 新建一轮 Actions 工作流，不要 Re-run 旧任务：

```text
version: v1.7.1
create_release: true
make_latest: true
```

本包包含完整 v1.7.0 功能基础，以及 v1.7.1 API Key / Keychain 读取修复。
