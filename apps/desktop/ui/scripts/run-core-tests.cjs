const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const uiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(uiRoot, "../../..");
const buildRoot = path.join(repoRoot, ".tokenfence-test-build");

const sourceFiles = [
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
];

const compiledModuleTests = [
  "scripts/v2-2-reliability-test.cjs",
  "scripts/v2-2-safety-runtime-test.cjs",
  "scripts/v2-2-runtime-store-test.cjs",
  "scripts/v2-2-codex-streaming-test.cjs",
  "scripts/v2-2-provider-stream-session-test.cjs",
  "scripts/v2-3-collaboration-test.cjs",
  "scripts/v2-3-project-change-session-test.cjs",
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
