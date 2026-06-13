# Changelog

## v1.0.0-rc2 (2026-06-14)
- **ZIP-wrapped DOCX output**: Upgraded DOCX generator from Flat OOXML to standard ZIP-wrapped OOXML format.
- **Upgraded acceptance tests**: v1.0 acceptance test script upgraded with enhanced checks.
- **README UTF-8 verification**: Chinese README encoding verified clean, all mojibake removed.
- Merged rc2 hardening branch into main.

## v1.0.0-rc1 (2026-06-13)
- **Product candidate**: v1.0 acceptance tests running (35 checks), Provider Hub with 11 profiles, real runtime workflows.
- Bilingual i18n support (English + Simplified Chinese) for Web, Desktop, and Android.
- Chinese README fully repaired: clean UTF-8, all mojibake removed.

## v0.5.24 (2026-06-13)
- **First stable Android navigation build**: Custom React Native core navigation replacing crash-prone @react-navigation/bottom-tabs.
- 12 Mobile Lite screens tested with zero FATAL / ReactNativeJS crash logs.
- **Recommended download**: `TokenFence-Mobile-Lite-Android-v0.5.24-internal-release.apk` (57.3 MB, standalone, no Metro required).
- **Windows desktop package**: Tauri 2 built MSI + NSIS installer. i686 GNU toolchain, unsigned experimental. x64 pending.
- Desktop UI built with Vite + React + TypeScript, reusing shared package logic.

## v0.5.22 (2026-06-13)
- **Stable Android navigation**: Replaced crash-prone @react-navigation/bottom-tabs with custom type-safe route registry and tab shell.
- Pure React Native components (Context + View + TouchableOpacity), zero crash-prone dependencies at runtime.
- Added ErrorBoundary for per-screen crash isolation.
- 12-screen architecture: Home, Guard, Documents, Models, Archive, Settings, AgentLab, PluginStore, Output, MindMap, ComputerUse, Routing.

## v0.5.1 (2026-06-12)
- **Android startup crash fix**: Replaced deprecated Clipboard from react-native with expo-clipboard (React Native 0.76 / Expo SDK 52 removed built-in Clipboard).

## v0.5.0 (2026-06-12)
- **Agent Workspace**: Agent Runtime modules (types, permissions, execution log, runtime installer, command approval, health).
- Plugin System with 10 built-in plugins across 7 categories.
- New Web UI pages: Agent Lab, Plugin Store, Output Generation, Computer Use Control, Routing Rules.
- Updated Desktop UI (6 new screens) and Android HomeScreen (5 experimental cards).
- 11 new docs.

---

See [docs/changelog/README.md](./docs/changelog/README.md) for detailed development update notes.