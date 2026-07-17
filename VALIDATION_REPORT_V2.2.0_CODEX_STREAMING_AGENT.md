# Chris Studio v2.2.0 第三批验证报告

## 已通过

- `npm --prefix apps/desktop/ui run typecheck`
- `npm --prefix apps/desktop/ui run test:core`
- `npm --prefix apps/desktop/ui run build`
- TypeScript 严格类型检查
- Vite 生产构建：476 个模块转换完成
- 原有可靠运行、Provider、Computer Use、回滚和运行状态测试
- 新增 Codex 布局、发送后安全扫描、流式接口和模型动作协议测试
- Computer Use JSON 动作解析、应用白名单、按键白名单、视觉点击限制测试
- GitHub Actions YAML 解析
- Release Shell 脚本 `bash -n`
- v2.2.0 发版输入及五处版本一致性验证
- `git diff --check`
- 干净临时目录中的 `npm ci --legacy-peer-deps` 安装验证

核心测试最终输出：

```text
v2.2 reliable Agent run tests passed
v2.2 provider, Computer Use and rollback tests passed
v2.2 runtime store tests passed
v2.2 Codex layout, streaming and model Computer Use tests passed
CHRIS_STUDIO_CORE_TESTS_PASSED
v2.2 product metadata synchronization tests passed
v2.2 workspace reliability integration tests passed
CHRIS_STUDIO_V2_2_CORE_TEST_SUITE_PASSED
```

## 必须由 GitHub Actions 验证

当前执行环境没有 Rust/macOS 工具链，因此以下项目没有虚报为本地通过：

- `cargo check`
- Apple Silicon Tauri 构建
- Intel Tauri 构建
- DMG 与 APP ZIP 安装
- 真实 DeepSeek SSE 网络流
- macOS 屏幕录制、辅助功能权限及 Computer Use 实机操作
- GitHub Release 真实上传和远端资源核验

仓库根目录的旧 `guard:source` 和 `release:sanity` 脚本仍包含 v1.5/TokenFence 时代的固定断言，当前 Actions 不把它们作为 v2.2.0 构建门禁。本包没有用修改产品代码去迎合这些废弃断言。
