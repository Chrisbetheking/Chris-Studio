# Chris Studio v2.2.0 Patch Validation Report

本报告针对本次增量包本身，不把尚未在 GitHub macOS Runner 上执行的内容写成已通过。

## 已在交付环境完成

- JSON 解析：通过；
- Cargo.toml 解析：通过；
- GitHub Actions YAML 结构解析：通过；
- Shell 脚本 `bash -n`：通过；
- Python 发布预检脚本编译与本地版本一致性检查：通过；
- TypeScript 可靠运行、回滚、Provider 遥测与 Computer Use 守卫模块严格编译：通过；
- v2.2.0 Agent 状态机、三轮修复、一次性审批、硬超时、坐标边界、Provider 错误归一化与回滚计划单元测试：通过；
- 双架构资源清单与 SHA-256 校验脚本：使用模拟资产通过；
- GitHub CLI 发布脚本：使用 mock `gh` 完成“首次创建、已有 Release 更新、查询瞬时失败重试、单资产瞬时失败重试、make_latest=false”集成验证；
- GitHub Actions 使用 checkout/setup-node v6、upload-artifact v7、download-artifact v8；
- 增量包目录结构与 SHA-256：通过。

## 必须由新 GitHub Actions 任务完成

- 当前仓库完整 TypeScript dependency graph；
- 既有 privacy/token/knowledge 核心测试和新增可靠运行测试；
- Vite production build；
- macOS Apple Silicon `cargo check` / Tauri build；
- macOS Intel `cargo check` / Tauri build；
- GitHub Release 真实创建或更新、资产上传重试与远端核验。

旧失败任务不能证明新工作流的结果。上传补丁后必须新建 v2.2.0 workflow run，不要对旧任务点 Re-run jobs。
