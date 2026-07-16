# TokenFence Studio v1.8.0 macOS 发布检查表

- [ ] `.github/workflows/tokenfence-macos.yml` 已上传到正确隐藏目录
- [ ] `apps/desktop/ui/package.json` 与 `package-lock.json` 同步
- [ ] `npm run typecheck` 通过
- [ ] `npm run test:core` 通过
- [ ] `npm run build` 通过
- [ ] `python3 scripts/verify_tokenfence_patch.py` 通过
- [ ] GitHub Actions 中 `cargo check` 通过
- [ ] Apple Silicon 构建通过
- [ ] Intel 构建通过
- [ ] Release 中存在 DMG、APP ZIP、安装助手、SHA-256、签名状态文件
- [ ] 有 Apple Developer 凭证时，`codesign`、`spctl`、`stapler` 验证通过
- [ ] README 的 Latest Release 下载链接可访问
- [ ] 安装后验证 Provider、OCR、Coding Agent、GitHub、Computer Use 和更新检查
