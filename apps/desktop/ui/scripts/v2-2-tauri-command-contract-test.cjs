const fs = require("node:fs");
const path = require("node:path");

const uiRoot = path.resolve(__dirname, "..");
const mainRs = path.resolve(uiRoot, "../src-tauri/src/main.rs");
const source = fs.readFileSync(mainRs, "utf8");

function fail(message) {
  throw new Error(`[Tauri command contract] ${message}`);
}

// Every async Tauri v1 command in this project must return Result. This keeps
// borrowed State inputs from surfacing lifetime errors only during cargo check.
const asyncCommands = [...source.matchAll(/#\[tauri::command(?:\([^\]]*\))?\]\s*async\s+fn\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:->\s*([^\{]+))?\{/g)];
for (const match of asyncCommands) {
  const [, name, args, returnType = ""] = match;
  if (!/\bResult\s*</.test(returnType)) {
    fail(`async command ${name} must return Result<..., ...>; found ${returnType.trim() || "no return type"}.`);
  }
  if (/State\s*</.test(args) && !/\bResult\s*</.test(returnType)) {
    fail(`async command ${name} borrows managed State without a Result return type.`);
  }
}

// Streaming must be started by a short synchronous command. Keeping the invoke
// open until the blocking SSE reader finishes can delay renderer event delivery
// and turns a real stream into one completed response.
const streamSignature = source.match(/#\[tauri::command\]\s*fn\s+provider_chat_stream\s*\(([\s\S]*?)\)\s*->\s*([^\{]+)\{/);
if (!streamSignature) fail("provider_chat_stream must exist as a synchronous start command.");
if (!/Result\s*<\s*bool\s*,\s*String\s*>/.test(streamSignature[2])) {
  fail("provider_chat_stream must return Result<bool, String> immediately after scheduling the worker.");
}
if (/async\s+fn\s+provider_chat_stream/.test(source)) {
  fail("provider_chat_stream must not await the full provider response.");
}
if (!/tauri::async_runtime::spawn\s*\(\s*async\s+move/.test(source)) {
  fail("provider_chat_stream must detach an async supervisor.");
}
if (!/tauri::async_runtime::spawn_blocking/.test(source)) {
  fail("provider_chat_stream must keep blocking SSE I/O off the UI/runtime thread.");
}
if (!/\n\s*Ok\s*\(\s*true\s*\)\s*\n\}/.test(source)) {
  fail("provider_chat_stream must acknowledge worker startup with Ok(true).");
}
if (!/return\s+Err\s*\(\s*"The provider stream identifier is invalid\./.test(source)) {
  fail("provider_chat_stream must reject invalid stream identifiers before spawning work.");
}

console.log("V2_2_TAURI_COMMAND_CONTRACT_PASSED");
