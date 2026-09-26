const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const uiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(uiRoot, "../../..");
const buildRoot = path.join(repoRoot, ".tokenfence-test-build");

const sourceFiles = [
  // Ambient declarations first: the Vite `*?url` module (used by the PDF worker
  // import) must resolve before any module that imports it is type-checked.
  "src/vite-env.d.ts",
  "src/app/types.ts",
  "src/app/identity.ts",
  "src/app/store.ts",
  "src/app/providerRegistry.ts",
  "src/features/safety/scanner.ts",
  "src/features/tokens/optimizer.ts",
  "src/features/files/knowledge.ts",
  "src/features/agent-runtime/reliableRun.ts",
  "src/features/agent-runtime/collaborativeRun.ts",
  "src/features/agent-runtime/runtimeStore.ts",
  "src/features/agent-runtime/rollbackPlan.ts",
  "src/features/projects/projectChangeSession.ts",
  "src/features/providers/providerTelemetry.ts",
  "src/features/providers/providerClient.ts",
  "src/features/providers/providerClientReliable.ts",
  "src/features/computer-use/sessionGuard.ts",
  "src/features/computer-use/modelComputerProtocol.ts",
  "src/features/computer/computerClientReliable.ts",
  "src/features/unified-agent/contextWindow.ts",
  "src/features/unified-agent/runtimeStore.ts",
  "src/features/privacy/contentClassifier.ts",
  "src/features/comparison/structuredDiff.ts",
  "src/features/files/fileProcessor.ts",
];

const compiledModuleTests = [
  "scripts/v2-2-reliability-test.cjs",
  "scripts/v2-2-safety-runtime-test.cjs",
  "scripts/v2-2-runtime-store-test.cjs",
  "scripts/v2-2-codex-streaming-test.cjs",
  "scripts/v2-2-provider-stream-session-test.cjs",
  "scripts/v2-3-collaboration-test.cjs",
  "scripts/v2-3-project-change-session-test.cjs",
  "scripts/v2-4-diff-path-decoding-test.cjs",
  // Consume the temporary CommonJS build, so they must run before
  // core-privacy-test.cjs removes that directory.
  "scripts/v2-4-context-window-test.cjs",
  "scripts/v2-4-unified-runtime-store-test.cjs",
  "scripts/v2-4-locale-independence-test.cjs",
  "scripts/v2-4-attachment-bounds-test.cjs",
  "scripts/v2-4-storage-quota-test.cjs",
  "scripts/v2-4-provider-usage-shapes-test.cjs",
  "scripts/v2-4-token-compaction-safety-test.cjs",
];

// core-privacy-test.cjs is intentionally last among tests that consume the
// temporary CommonJS build because the legacy test removes that directory.
const remainingTests = [
  "scripts/v2-2-tauri-command-contract-test.cjs",
  "scripts/core-privacy-test.cjs",
  "scripts/v2-2-product-metadata-test.cjs",
  "scripts/v2-2-workspace-integration-test.cjs",
  "scripts/v2-2-live-stream-computer-contract-test.cjs",
  "scripts/v2-2-final-closeout-test.cjs",
  "scripts/v2-4-alpha2-privacy-comparison-test.cjs",
  "scripts/v2-4-guard-contract-test.cjs",
  "scripts/v2-4-guard-redaction-test.cjs",
  // Compile the shared package on their own, so they do not depend on the
  // temporary CommonJS build and can run in any order.
  "scripts/v2-4-storage-path-safety-test.cjs",
  "scripts/v2-4-file-type-detection-test.cjs",
  "scripts/v2-4-archive-sanitization-test.cjs",
  "scripts/v2-4-shared-mirror-test.cjs",
  "scripts/v2-4-citation-budget-bounds-test.cjs",
  "scripts/v2-4-installed-models-test.cjs",
  "scripts/v2-4-active-project-repair-test.cjs",
  "scripts/v2-4-context-pack-repair-test.cjs",
  "scripts/v2-4-sample-tree-paths-test.cjs",
  "scripts/v2-4-macos-diagnostics-test.cjs",
  "scripts/v2-4-active-model-validation-test.cjs",
  "scripts/v2-4-token-usage-ledger-test.cjs",
  "scripts/v2-4-provider-state-validation-test.cjs",
  "scripts/v2-4-computer-use-persistence-test.cjs",
  "scripts/v2-4-execution-log-test.cjs",
  "scripts/v2-4-runtime-record-validation-test.cjs",
  "scripts/v2-4-store-load-resilience-test.cjs",
  "scripts/v2-4-knowledge-resilience-test.cjs",
  "scripts/v2-4-computer-action-parser-test.cjs",
  "scripts/v2-4-request-token-budget-test.cjs",
  "scripts/v2-4-compaction-policy-test.cjs",
  "scripts/v2-4-connector-resilience-test.cjs",
  "scripts/v2-4-github-client-resilience-test.cjs",
  "scripts/v2-4-product-version-source-test.cjs",
  "scripts/v2-4-screen-scale-test.cjs",
  "scripts/v2-4-unified-agent-test.cjs",
];

function fail(message) {
  throw new Error(`[Chris Studio core tests] ${message}`);
}

function runNodeScript(relativePath) {
  const absolutePath = path.join(uiRoot, relativePath);
  if (!fs.existsSync(absolutePath)) fail(`Missing test script: ${relativePath}`);
  const result = spawnSync(process.execPath, [absolutePath], {
    cwd: uiRoot,
    env: {
      ...process.env,
      NODE_PATH: [path.join(uiRoot, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${relativePath} exited with code ${result.status ?? "unknown"}.`);
  }
}

function compileCoreModules() {
  for (const relativePath of sourceFiles) {
    if (!fs.existsSync(path.join(uiRoot, relativePath))) {
      fail(`Missing TypeScript source: ${relativePath}`);
    }
  }

  let tscPath;
  try {
    tscPath = require.resolve("typescript/bin/tsc", { paths: [uiRoot] });
  } catch (error) {
    fail(`Cannot resolve the local TypeScript compiler. Run npm ci first. ${error}`);
  }

  const args = [
    tscPath,
    "--target", "ES2022",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--lib", "ES2022,DOM",
    "--strict",
    "--skipLibCheck",
    "--rootDir", "src",
    "--outDir", buildRoot,
    ...sourceFiles,
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: uiRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`TypeScript core-module compilation exited with code ${result.status ?? "unknown"}.`);
  }

  const requiredOutputs = [
    "app/types.js",
    "features/agent-runtime/reliableRun.js",
    "features/agent-runtime/collaborativeRun.js",
    "features/agent-runtime/runtimeStore.js",
    "features/agent-runtime/rollbackPlan.js",
    "features/projects/projectChangeSession.js",
    "features/providers/providerTelemetry.js",
    "features/providers/providerClient.js",
    "features/computer-use/sessionGuard.js",
    "features/computer-use/modelComputerProtocol.js",
    "features/computer/computerClientReliable.js",
  ];
  const missing = requiredOutputs.filter((relativePath) => !fs.existsSync(path.join(buildRoot, relativePath)));
  if (missing.length > 0) {
    fail(`TypeScript compilation finished without expected output: ${missing.join(", ")}`);
  }
}

fs.rmSync(buildRoot, { recursive: true, force: true });

try {
  compileCoreModules();
  for (const script of compiledModuleTests) runNodeScript(script);
  for (const script of remainingTests) runNodeScript(script);
  console.log("CHRIS_STUDIO_V2_2_CORE_TEST_SUITE_PASSED");
  console.log("CHRIS_STUDIO_V2_3_ALPHA3_CHECKPOINT_RECOVERY_PASSED");
  console.log("CHRIS_STUDIO_V2_3_ALPHA4_TRANSACTIONAL_CODING_PASSED");
} finally {
  fs.rmSync(buildRoot, { recursive: true, force: true });
}
