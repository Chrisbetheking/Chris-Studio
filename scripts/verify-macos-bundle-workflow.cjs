const fs = require('fs');

const workflowPath = '.github/workflows/tokenfence-macos.yml';
const packagerPath = 'scripts/package-macos-release.sh';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const packager = fs.readFileSync(packagerPath, 'utf8');

const assertions = [
  [workflow.includes('tauri build --bundles app --ci'), 'Tauri build must package only the .app bundle in CI.'],
  [workflow.includes('bash scripts/package-macos-release.sh'), 'Workflow must invoke the custom macOS packager.'],
  [workflow.includes('arch: arm64') && workflow.includes('arch: x86_64'), 'Matrix must declare expected Apple Silicon and Intel architectures.'],
  // v2.4 retired CI-side lockfile mutation: the committed Cargo.lock is authoritative.
  [!workflow.includes('cargo generate-lockfile'), 'Release workflow must never mutate Cargo.lock in CI.'],
  [workflow.includes('cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml'), 'Release workflow must check the synchronized Rust dependency graph in locked mode.'],
  [workflow.includes('cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml'), 'Release workflow must execute the locked native test suite.'],
  [workflow.includes('--nocapture'), 'Native tests must run with --nocapture so transactional boundary output is visible.'],
  [workflow.includes("RELEASE_VERSION: ${{ inputs.version || github.ref_name }}"), 'Manual dispatch and version tags must resolve to one release version.'],
  [workflow.includes("prerelease: ${{ contains(env.RELEASE_VERSION, '-') }}"), 'Alpha tags must publish as GitHub pre-releases.'],
  [workflow.includes("make_latest: ${{ !contains(env.RELEASE_VERSION, '-') && inputs.make_latest }}"), 'Alpha tags must never replace the latest stable release.'],
  [workflow.includes("      - 'v*'"), 'A version tag must be able to trigger the release workflow.'],
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
