# Chris Studio v2.2.0 Runtime UI Validation Report

## 已通过

### JavaScript 与同步脚本

- 所有新增/修改 `.cjs` 文件通过 `node --check`。
- App 可靠执行中心注入测试通过。
- WorkspaceScreen Provider/Computer 适配器替换测试通过。
- ComputerScreen 适配器替换测试通过。
- 同步脚本重复执行保持幂等。
- 既有产品版本与身份元数据测试继续通过。

### TypeScript

以下模块在 `strict` 模式下联合编译通过：

- `ReliableRunController`
- `runtimeStore`
- `providerTelemetry`
- `providerClientReliable`
- `ComputerUseSessionGuard`
- `computerClientReliable`
- `ReliabilityDock`

适配器使用 `typeof` 和 `Parameters/ReturnType` 保持现有 Provider 与 Computer 客户端函数签名。

### Core Suite

模拟 GitHub Actions 完整输出：

```text
v2.2 reliable Agent run tests passed
v2.2 provider, Computer Use and rollback tests passed
v2.2 runtime store tests passed
CHRIS_STUDIO_CORE_TESTS_PASSED
v2.2 product metadata synchronization tests passed
v2.2 workspace reliability integration tests passed
CHRIS_STUDIO_V2_2_CORE_TEST_SUITE_PASSED
```

该模拟仍保留旧 `core-privacy-test.cjs` 会删除临时编译目录的行为，用于确认上一轮测试生命周期修复没有回归。

### 行为测试

- 连续两个 500 服务错误后，第三次请求成功，执行记录标记 completed。
- 401/API Key 错误只请求一次，不进行无意义重试。
- Computer screenshot 请求未返回时，全局紧急停止立即结束等待并标记 cancelled。
- 状态订阅取消函数符合 React Effect 清理类型。
- 结束状态保留完成/停止信息和失败/超时错误。
- 应用重启后的遗留活动任务不会继续显示为运行中。

## 仍需 GitHub Actions 验证

当前环境没有完整实时仓库、macOS Runner、Apple Silicon/Intel Tauri 打包环境，因此下列项目必须由上传后的新 Actions 任务验证：

- 当前完整 UI 的 `tsc --noEmit`；
- Vite production build；
- Rust `cargo check`；
- Apple Silicon Tauri build；
- Intel Tauri build；
- Release 资源上传、重试与远端核验。

## 仍需真实 Mac 验收

- 可靠执行中心在深色/浅色与中英文模式的显示；
- 真实 Provider 成功、限流、断网、认证失败；
- 真实 macOS 截图、点击、输入、按键；
- Computer Use 紧急停止；
- 应用关闭重开后的中断任务显示；
- 安装包升级和历史数据保留。
