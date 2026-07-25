const fs = require('node:fs');
const path = require('node:path');

const uiRoot = path.resolve(__dirname, '..');
const mainRs = path.resolve(uiRoot, '../src-tauri/src/main.rs');
const source = fs.readFileSync(mainRs, 'utf8');

function fail(message) {
  throw new Error(`[Tauri command contract] ${message}`);
}

const commands = [...source.matchAll(/#\[tauri::command(?:\([^\]]*\))?\]\s*(async\s+)?fn\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:->\s*([^\{]+))?\{/g)];
if (commands.length === 0) fail('No Tauri commands were found; the source parser may be stale.');

for (const match of commands) {
  const [, asyncKeyword = '', name, args, returnType = ''] = match;
  if (asyncKeyword && !/\bResult\s*</.test(returnType)) {
    fail(`async command ${name} must return Result<..., ...>; found ${returnType.trim() || 'no return type'}.`);
  }
  if (asyncKeyword && /State\s*</.test(args) && !/\bResult\s*</.test(returnType)) {
    fail(`async command ${name} borrows managed State without a Result return type.`);
  }
}

const streamCommand = commands.find((match) => match[2] === 'provider_chat_stream');
if (!streamCommand) fail('provider_chat_stream is missing.');
const [, asyncKeyword = '', , streamArgs, streamReturn = ''] = streamCommand;
if (!/Window/.test(streamArgs) || !/State\s*</.test(streamArgs) || !/stream_id\s*:\s*String/.test(streamArgs)) {
  fail('provider_chat_stream must accept Window, managed State and a stream_id.');
}
if (!/Result\s*<\s*bool\s*,\s*String\s*>/.test(streamReturn)) {
  fail(`provider_chat_stream must return Result<bool, String>; found ${streamReturn.trim() || 'no return type'}.`);
}
if (asyncKeyword) {
  fail('provider_chat_stream must return immediately and run its blocking stream worker in the background.');
}
if (!/tauri::async_runtime::spawn\s*\(\s*async\s+move/.test(source)) {
  fail('provider_chat_stream must launch a background async worker.');
}
if (!/spawn_blocking\s*\(\s*move\s*\|\|/.test(source)) {
  fail('provider_chat_stream must isolate blocking SSE work with spawn_blocking.');
}
if (!/chris-studio:\/\/provider-stream/.test(source)) {
  fail('provider_chat_stream must emit the progressive provider-stream event.');
}
if (!/Ok\s*\(\s*true\s*\)/.test(source)) {
  fail('provider_chat_stream must acknowledge successful worker startup with Ok(true).');
}
if (!/provider_stream_cancel/.test(source)) {
  fail('The progressive stream cancellation command is missing.');
}

console.log('V2_2_TAURI_STREAM_COMMAND_CONTRACT_PASSED');
