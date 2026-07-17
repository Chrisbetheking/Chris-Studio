const fs = require("node:fs");
const path = require("node:path");

const uiRoot = path.resolve(__dirname, "..");
const mainRs = path.resolve(uiRoot, "../src-tauri/src/main.rs");
const source = fs.readFileSync(mainRs, "utf8");

function fail(message) {
  throw new Error(`[Tauri command contract] ${message}`);
}

// Project rule: every async Tauri v1 command returns Result. This is stricter
// than the minimum framework requirement and prevents borrowed command inputs
// such as State<'_, T> from producing AsyncCommandMustReturnResult/lifetime
// failures only when cargo check runs on GitHub Actions.
const asyncCommands = [...source.matchAll(/#\[tauri::command(?:\([^\]]*\))?\]\s*async\s+fn\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:->\s*([^\{]+))?\{/g)];
if (asyncCommands.length === 0) {
  fail("No async Tauri commands were found; the source parser may be stale.");
}

for (const match of asyncCommands) {
  const [, name, args, returnType = ""] = match;
  if (!/\bResult\s*</.test(returnType)) {
    fail(`async command ${name} must return Result<..., ...>; found ${returnType.trim() || "no return type"}.`);
  }
  if (/State\s*</.test(args) && !/\bResult\s*</.test(returnType)) {
    fail(`async command ${name} borrows managed State without a Result return type.`);
  }
}

const streamCommand = asyncCommands.find((match) => match[1] === "provider_chat_stream");
if (!streamCommand) fail("provider_chat_stream is missing or is no longer async.");
if (!/Result\s*<\s*ProviderReply\s*,\s*String\s*>/.test(streamCommand[3] || "")) {
  fail("provider_chat_stream must return Result<ProviderReply, String>.");
}
if (!/return\s+Ok\s*\(\s*ProviderReply::failure/.test(source)) {
  fail("provider_chat_stream invalid-input replies must be wrapped in Ok(...).");
}
if (!/\n\s*Ok\s*\(\s*reply\s*\)\s*\n\}/.test(source)) {
  fail("provider_chat_stream must wrap the worker reply in Ok(reply).");
}

console.log("V2_2_TAURI_ASYNC_COMMAND_CONTRACT_PASSED");
