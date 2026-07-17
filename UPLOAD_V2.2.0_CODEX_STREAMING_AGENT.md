# Chris Studio v2.2.0 第三批上传说明

本包是增量覆盖包，不是完整仓库。

## 上传

1. 解压本 ZIP。
2. 打开 `Chris_Studio_v2.2.0_CODEX_STREAMING_AGENT_PATCH`。
3. 显示隐藏文件，确保能够看到 `.github`。
4. 将该目录内部的 `.github` 和 `apps` 一次拖到 GitHub 仓库根目录覆盖。
5. 同时上传根目录的说明文件可选，不影响构建。

建议提交信息：

```text
feat: add Codex streaming workspace and model computer agent
```

## 运行新工作流

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

## 首轮验收重点

1. 左侧出现最近对话，可打开、重命名、删除和查看全部。
2. 顶部 `中 / EN` 可即时切换语言。
3. 输入期间不显示实时风险结果，点击发送后才检查。
4. DeepSeek 回答应边生成边出现，停止按钮应立即结束前台响应。
5. 可靠执行中心应记录流式请求；首字前的临时错误可重连，已有输出后不重复续接。
6. Computer Use 页面应以“目标驱动的桌面 Agent”为主体，手动按钮折叠到开发者区域。
7. DeepSeek 等非视觉模型可以执行已知应用、输入和快捷键步骤；坐标点击必须使用支持视觉的模型。
8. 历史页不应再出现双列重叠、白色空按钮和横向溢出。
