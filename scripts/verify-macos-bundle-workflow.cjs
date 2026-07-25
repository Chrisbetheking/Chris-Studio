const fs = require('fs');

const workflowPath = '.github/workflows/tokenfence-macos.yml';
const packagerPath = 'scripts/package-macos-release.sh';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const packager = fs.readFileSync(packagerPath, 'utf8');

const assertions = [
  [workflow.includes('tauri build --bundles app --ci'), 'Tauri build must package only the .app bundle in CI.'],
  [workflow.includes('bash scripts/package-macos-release.sh'), 'Workflow must invoke the custom macOS packager.'],
  [workflow.includes('arch: arm64') && workflow.includes('arch: x86_64'), 'Matrix must declare expected Apple Silicon and Intel architectures.'],
  [workflow.includes('cargo generate-lockfile --manifest-path apps/desktop/src-tauri/Cargo.toml'), 'Release workflow must synchronize the native Rust lockfile before locked checks.'],
  [workflow.includes('cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml'), 'Release workflow must check the synchronized Rust dependency graph in locked mode.'],
  [workflow.includes('cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml project_change_tests'), 'Release workflow must compile and execute transactional Rust boundary tests.'],
  [workflow.includes("prerelease: ${{ contains(inputs.version, '-') }}"), 'Alpha tags must publish as GitHub pre-releases.'],
  [workflow.includes("make_latest: ${{ !contains(inputs.version, '-') && inputs.make_latest }}"), 'Alpha tags must never replace the latest stable release.'],
  [!workflow.includes('DMG_PATH="$(find "$BUNDLE_DIR/dmg"'), 'Workflow must not depend on Tauri bundle_dmg.sh output.'],
  [packager.includes('hdiutil create'), 'Custom packager must create the DMG with hdiutil.'],
  [packager.includes('lipo -archs'), 'Custom packager must verify the binary architecture.'],
  [packager.includes('no Finder/AppleScript layout step'), 'Custom DMG generation must avoid Finder/AppleScript layout automation.'],
  [packager.includes('publishing APP ZIP fallback'), 'A DMG failure must preserve the installable APP ZIP fallback.'],
];

for (const [ok, message] of assertions) {
  if (!ok) throw new Error(message);
}

console.log('CHRIS_STUDIO_MACOS_BUNDLE_WORKFLOW_CONTRACT_PASSED');
