# Chris Studio v2.2.0 实时流式与 Computer Use 进度修复验证报告

## 已执行

- `npm ci --legacy-peer-deps`：PASS
- `npm run typecheck`：PASS
- `npm run test:core`：PASS
- `npm run build`：PASS
- 公共 npm registry 锁文件检查：PASS
- GitHub Actions YAML 解析：PASS
- 增量包逐文件 SHA-256：PASS
- ZIP 解压回环：PASS

## Core Test 关键输出

```text
v2.2 reliable Agent run tests passed
v2.2 provider, Computer Use and rollback tests passed
v2.2 runtime store tests passed
v2.2 Codex layout, streaming and model Computer Use tests passed
v2.2 progressive provider stream session tests passed
V2_2_TAURI_COMMAND_CONTRACT_PASSED
CHRIS_STUDIO_CORE_TESTS_PASSED
v2.2 product metadata synchronization tests passed
v2.2 workspace reliability integration tests passed
V2_2_LIVE_STREAM_COMPUTER_CONTRACT_PASSED
CHRIS_STUDIO_V2_2_CORE_TEST_SUITE_PASSED
```

## Production build

```text
vite v6.4.3
476 modules transformed
built successfully
```

## 未在当前环境执行

- `cargo check --locked`
- Apple Silicon Tauri 构建
- Intel Tauri 构建
- 真实 macOS TextEdit 自动化
- 真实 DeepSeek 网络流式输出

当前容器没有 Rust/Cargo 和 macOS AppKit 环境。以上项目必须由新的 GitHub Actions 与 Mac 安装包完成验证，不能标记为 PASS。

## 新增门禁

- 工作台不得在当前流式会话已存在时用历史记录覆盖它。
- 待处理新会话必须在侧栏选中前持久化。
- 运行中的助手消息不得被空主页覆盖。
- 已知 TextEdit 目标必须执行打开和输入，才能接受完成。
- TextEdit 打开必须创建无标题文档。
- Computer Use 必须显示步骤进度并建立父级运行记录。
