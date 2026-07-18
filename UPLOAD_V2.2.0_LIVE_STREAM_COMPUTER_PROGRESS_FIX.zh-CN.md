# 上传和复测说明

## 上传

解压后，将压缩包内部的 `apps` 目录拖到 GitHub 仓库根目录覆盖。

建议提交信息：

```text
fix: preserve live streaming state and complete computer goals
```

然后创建新的工作流：

```text
version: v2.2.0
create_release: true
make_latest: true
```

不要重新运行旧提交对应的失败任务。

## 新安装包重点复测

### 真流式

新建会话并发送：

```text
请生成一篇约2000字的人工智能发展报告，分为10个小节。
```

通过标准：完整回答结束前，助手消息中已经持续出现正文；不能由空主页覆盖，不能结束后才整段出现。

### Computer Use

目标：

```text
打开 TextEdit，新建一个空白文档，输入：
Chris Studio Test
完成后停止，不要保存。
```

通过标准：

1. 页面立即显示步骤列表和进度。
2. 创建 TextEdit 无标题文档，不出现文件选择器。
3. 批准输入后，文字出现在该无标题文档中。
4. 打开和输入未成功前，任务不得宣称完成。
5. 完成后父级会话显示完成；急停后不得继续操作。
