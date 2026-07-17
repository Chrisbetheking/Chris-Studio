# Chris Studio v2.2.0 第二批上传说明

## 1. 上传

解压 ZIP 后，把压缩包内部的全部内容拖到 GitHub 仓库根目录覆盖。代码路径已经保持原仓库结构；本包不包含完整仓库。

本次主要覆盖：

```text
apps/desktop/ui/scripts/
apps/desktop/ui/src/components/
apps/desktop/ui/src/features/agent-runtime/
apps/desktop/ui/src/features/computer/
apps/desktop/ui/src/features/providers/
apps/desktop/ui/src/styles/
```

建议提交信息：

```text
feat: wire v2.2.0 reliable runtime into workspace
```

## 2. 新建 Actions 任务

不要对旧失败任务点击 Re-run jobs。进入：

```text
Actions
→ Chris Studio macOS Builds and Release
→ Run workflow
```

参数：

```text
version: v2.2.0
create_release: true
make_latest: true
```

Core Test 正常应包含：

```text
v2.2 reliable Agent run tests passed
v2.2 provider, Computer Use and rollback tests passed
v2.2 runtime store tests passed
CHRIS_STUDIO_CORE_TESTS_PASSED
v2.2 product metadata synchronization tests passed
v2.2 workspace reliability integration tests passed
CHRIS_STUDIO_V2_2_CORE_TEST_SUITE_PASSED
```

然后确认 UI typecheck、Vite build、cargo check、Apple Silicon build、Intel build、Release 发布与资源核验全部为绿色。

## 3. Mac 手动验收

1. 启动应用，确认侧栏版本为 `v2.2.0`。
2. 发送一次真实模型请求，右下角应出现“可靠执行”，面板内应显示 Provider、模型、状态和检查点。
3. 使用错误 API Key，确认只失败一次，不重复请求。
4. 在可控环境制造断网或服务端错误，确认最多自动修复 3 次，不无限循环。
5. 运行截图或其他已批准的 Computer Use 动作，确认执行收据出现。
6. 在一个较慢的操作执行中点击“紧急停止”，确认状态变为已停止。
7. 关闭应用后重新打开，旧的未完成任务应显示为重启中断，而不是一直运行中。
8. 切换中英文与深浅模式，检查面板、按钮、滚动和遮挡。
9. 核对 Apple Silicon、Intel 安装包和校验文件均出现在 v2.2.0 Release。
