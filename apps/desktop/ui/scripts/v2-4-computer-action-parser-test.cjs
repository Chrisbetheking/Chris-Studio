// Regression tests: the Computer Use action parser must reject malformed actions.
//
// Three defects were confirmed by probing:
//
//  1. `numberValue` used `Number(value)`, which accepts `null`, `''`, `[]` and
//     `true` as `0`/`1`. A reply that omitted its click coordinates therefore
//     became a click at the top-left corner of the screen, and the approval
//     prompt showed a plausible coordinate instead of reporting the malformed
//     action.
//
//  2. The application allowlist was enforced only for the `open` action, so a
//     `type` or `key` action could name an arbitrary application.
//
//  3. Non-string replies reached `value.match` and threw a `TypeError` instead
//     of the actionable protocol message.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');
const MODULE = 'apps/desktop/ui/src/features/computer-use/modelComputerProtocol.ts';

const compiledCache = new Map();

function loadCompiled(target) {
  if (compiledCache.has(target)) return compiledCache.get(target);
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected external dependency: ${specifier}`);
    const base = path.resolve(path.dirname(target), specifier);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return loadCompiled(candidate);
    }
    throw new Error(`Cannot resolve ${specifier}`);
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    target,
    path.dirname(target),
  );
  compiledCache.set(target, module.exports);
  return module.exports;
}

const protocol = loadCompiled(path.join(repoRoot, MODULE));
const { parseModelComputerAction } = protocol;

function parse(payload, vision = true) {
  return parseModelComputerAction(JSON.stringify(payload), vision);
}
function reason(payload, vision = true) {
  try {
    parse(payload, vision);
    return null;
  } catch (error) {
    return String(error && error.message);
  }
}

// --- 1. coordinates must be real numbers --------------------------------
for (const bad of [null, '', '   ', [], {}, true, false]) {
  const message = reason({ action: 'click', reason: 'r', x: bad, y: bad });
  assert.ok(message, `the coordinate ${JSON.stringify(bad)} must be rejected`);
  assert.match(message, /invalid click coordinates/i, `the ${JSON.stringify(bad)} coordinate reports the coordinate error`);
}
// An omitted coordinate is equally invalid — it used to become (0,0).
assert.match(reason({ action: 'click', reason: 'r' }), /invalid click coordinates/i);
assert.match(reason({ action: 'click', reason: 'r', x: 10 }), /invalid click coordinates/i);
assert.match(reason({ action: 'click', reason: 'r', y: 10 }), /invalid click coordinates/i);

// Out-of-range and non-finite values are refused; the bound is inclusive.
assert.ok(reason({ action: 'click', reason: 'r', x: -1, y: 10 }), 'a negative coordinate must be rejected');
assert.ok(reason({ action: 'click', reason: 'r', x: 16_385, y: 10 }), 'a coordinate beyond the bound must be rejected');
assert.ok(reason({ action: 'click', reason: 'r', x: Number.NaN, y: 10 }), 'NaN must be rejected');
parse({ action: 'click', reason: 'r', x: 0, y: 0 });
parse({ action: 'click', reason: 'r', x: 16_384, y: 16_384 });
assert.equal(parse({ action: 'click', reason: 'r', x: '120', y: '220' }).x, 120, 'a numeric string is still accepted');
assert.equal(parse({ action: 'click', reason: 'r', x: 10.7, y: 20.3 }).x, 10.7, 'a fractional coordinate is preserved');

// A click always needs a vision-capable model.
assert.match(reason({ action: 'click', reason: 'r', x: 1, y: 1 }, false), /vision-capable/i);

// --- 2. the application allowlist applies to every action ---------------
const ALLOWED = ['TextEdit', 'Notes', 'Safari', 'Finder', 'Terminal', 'System Settings'];
for (const app of ALLOWED) {
  const parsed = parse({ action: 'open', reason: 'r', app });
  assert.equal(parsed.app, app, `the allowlisted app ${app} must be accepted by open`);
  assert.equal(parse({ action: 'type', reason: 'r', text: 'hello', app }).app, app,
    `the allowlisted app ${app} must be accepted by type`);
  assert.equal(parse({ action: 'key', reason: 'r', key: 'enter', app }).app, app,
    `the allowlisted app ${app} must be accepted by key`);
}
// Padding is normalized before the allowlist is consulted, so a padded but
// otherwise valid name is accepted rather than becoming a bypass.
assert.equal(parse({ action: 'open', reason: 'r', app: '  Terminal  ' }).app, 'Terminal',
  'a padded allowlisted name is trimmed and accepted');
// A blank application is the same as naming none: refused for `open` (which
// must target an application) and simply "unspecified" for `type` / `key`.
for (const app of ['Calculator', 'Mail', 'terminal', 'TEXTEDIT', 'TextEdit; rm -rf /', '', '   ']) {
  assert.match(reason({ action: 'open', reason: 'r', app }), /outside the allowlist/i,
    `open must refuse ${JSON.stringify(app)}`);
}
for (const app of ['Calculator', 'Mail', 'terminal', 'TEXTEDIT', 'TextEdit; rm -rf /']) {
  assert.match(reason({ action: 'type', reason: 'r', text: 'hello', app }), /outside the allowlist/i,
    `type must refuse ${JSON.stringify(app)}`);
  assert.match(reason({ action: 'key', reason: 'r', key: 'enter', app }), /outside the allowlist/i,
    `key must refuse ${JSON.stringify(app)}`);
}
assert.equal(parse({ action: 'type', reason: 'r', text: 'hello', app: '' }).app, undefined,
  'a blank application on type means no application is targeted');
assert.equal(parse({ action: 'key', reason: 'r', key: 'enter', app: '   ' }).app, undefined,
  'a blank application on key means no application is targeted');
// An `open` action must name an application.
assert.match(reason({ action: 'open', reason: 'r' }), /outside the allowlist/i);
// Actions that take no application are unaffected by the rule.
assert.equal(parse({ action: 'done', reason: 'r', message: 'finished' }).app, undefined);
assert.equal(parse({ action: 'ask', reason: 'r', message: 'question' }).app, undefined);
assert.equal(parse({ action: 'capture', reason: 'r' }).action, 'capture');

// --- 3. the key allowlist stays enforced --------------------------------
for (const key of ['enter', 'escape', 'tab', 'space', 'delete', 'cmd+n', 'cmd+s', 'cmd+l', 'cmd+w']) {
  assert.equal(parse({ action: 'key', reason: 'r', key }).key, key, `${key} must be accepted`);
  assert.equal(parse({ action: 'key', reason: 'r', key: key.toUpperCase() }).key, key, `${key} must be accepted in upper case`);
}
for (const key of ['cmd+q', 'cmd+space', 'f12', 'return', '', 42, null, {}]) {
  assert.match(reason({ action: 'key', reason: 'r', key }), /outside the allowlist/i,
    `${JSON.stringify(key)} must be refused`);
}

// --- 4. damaged replies fail with the protocol message ------------------
for (const content of [null, undefined, 42, {}, [], '', '   ']) {
  let message = null;
  try {
    parseModelComputerAction(content, true);
  } catch (error) {
    message = String(error && error.message);
  }
  assert.ok(message, `${String(content)} must be refused`);
  assert.doesNotMatch(message, /TypeError|is not a function/i, `${String(content)} must not surface a TypeError`);
  assert.match(message, /valid Computer Use action|unsupported Computer Use action/i,
    `${String(content)} must report the protocol error`);
}

// --- 5. the accepted shapes round-trip ----------------------------------
const open = parse({ action: 'open', reason: 'Open the notes app', app: 'Notes' });
assert.deepEqual(
  { action: open.action, app: open.app, reason: open.reason },
  { action: 'open', app: 'Notes', reason: 'Open the notes app' },
);
assert.equal(open.x, undefined, 'an open action carries no coordinates');
assert.equal(open.key, undefined, 'an open action carries no key');

const typed = parse({ action: 'type', reason: 'r', text: '  reviewed text  ' });
assert.equal(typed.text, 'reviewed text', 'the typing text is trimmed');
assert.match(reason({ action: 'type', reason: 'r' }), /empty typing action/i);

const done = parse({ action: 'done', reason: 'r', message: 'All steps completed' });
assert.equal(done.message, 'All steps completed');

// The fenced form and the surrounding-prose form both parse.
assert.equal(parseModelComputerAction('```json\n{"action":"done","content":"x","reason":"r"}\n```', true).action, 'done');
assert.equal(parseModelComputerAction('Here is my next step: {"action":"ask","reason":"r","message":"?"} thanks', true).action, 'ask');

// Unknown action ids and missing ids are refused.
assert.match(reason({ action: 'exec', reason: 'r' }), /unsupported Computer Use action/i);
assert.match(reason({ reason: 'r' }), /unsupported Computer Use action/i);
assert.match(reason({ action: 42, reason: 'r' }), /unsupported Computer Use action/i);

// A missing reason falls back to the documented default rather than undefined.
assert.equal(parse({ action: 'done' }).reason, 'Model-selected next step.');

// --- 6. the implementation must keep its guards -------------------------
const source = fs.readFileSync(path.join(repoRoot, MODULE), 'utf8');
assert.match(source, /function numberValue\(value: unknown\): number \| undefined/, 'the coordinate guard must stay present');
assert.match(source, /const ACTION_IDS: ReadonlySet<string>/, 'the action union must stay declared');
assert.match(source, /result\.app !== undefined && !ALLOWED_APPS\.has\(result\.app\)/, 'the allowlist must apply to every action');
assert.match(source, /typeof value !== 'string' \|\| !value\.trim\(\)/, 'the reply guard must stay present');
assert.doesNotMatch(
  source,
  /function numberValue\(value: unknown\): number \| undefined \{\s*\n\s*const parsed = Number\(value\);/,
  'the coercing coordinate parser must not return',
);
assert.doesNotMatch(
  source,
  /action === 'open' && \(!result\.app \|\| !ALLOWED_APPS\.has\(result\.app\)\)/,
  'the open-only allowlist check must not return',
);

console.log('CHRIS_STUDIO_V2_4_COMPUTER_ACTION_PARSER_PASSED');
