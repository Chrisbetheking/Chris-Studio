// Regression tests: citation rendering and budget estimates must be side-effect free.
//
// Four defects were found by probing the shared package:
//
//  1. `createCitationPanel` sorted the caller's array in place. `Array.sort`
//     mutates, so building a panel reordered whatever list the caller owned —
//     including a shared or frozen source list.
//  2. `formatCitationBlock` capped the rendered list at five sources without
//     saying so, so a reader assumed a truncated list was complete.
//  3. `estimateCost` passed a raw token count into the arithmetic. A negative
//     count produced a negative cost and a non-finite count produced `null`,
//     both of which reach the user as money.
//  4. `recommendBudgetRoute` returned `recommended: undefined` for an empty
//     provider list even though the type declares it non-null.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repoRoot = path.resolve(__dirname, '../../../..');

// Compiles the shared package on demand and resolves sibling imports for real:
// budget.ts imports PROVIDERS from ./providers, so a stub require would hide
// exactly the behaviour under test.
const compiledCache = new Map();

function compileTypeScript(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) {
      throw new Error(`Unexpected external dependency in the shared package: ${specifier}`);
    }
    const base = path.resolve(path.dirname(filePath), specifier);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate)) return loadCompiled(candidate);
    }
    throw new Error(`Cannot resolve ${specifier} from ${filePath}`);
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports,
    localRequire,
    module,
    filePath,
    path.dirname(filePath),
  );
  return module.exports;
}

function loadCompiled(filePath) {
  if (compiledCache.has(filePath)) return compiledCache.get(filePath);
  const exports = compileTypeScript(filePath);
  compiledCache.set(filePath, exports);
  return exports;
}

const loadModule = (relative) => loadCompiled(path.join(repoRoot, relative));

const citation = loadModule('packages/shared/src/citation.ts');
const budget = loadModule('packages/shared/src/budget.ts');

function source(id, relevance, patch = {}) {
  return { id, title: `Source ${id}`, snippet: `snippet ${id}`, relevance, retrievedAt: 1, ...patch };
}

// --- 1. panel construction must not reorder the caller's array ------------
const callerSources = [source('low', 0.1), source('high', 0.9), source('mid', 0.5)];
const callerOrderBefore = callerSources.map((entry) => entry.id).join(',');
const panel = citation.createCitationPanel('query', callerSources);
assert.equal(panel.sources.map((entry) => entry.id).join(','), 'high,mid,low', 'the panel must be sorted by relevance');
assert.equal(
  callerSources.map((entry) => entry.id).join(','),
  callerOrderBefore,
  'building a panel must not reorder the caller\'s array',
);
assert.notEqual(panel.sources, callerSources, 'the panel must hold its own array');
assert.ok(Array.isArray(panel.sources));

// The query and timestamp must survive unchanged.
assert.equal(panel.query, 'query');
assert.equal(typeof panel.generatedAt, 'number');

// --- 2. a truncated citation list must say so -----------------------------
const manySources = Array.from({ length: 12 }, (_value, index) => source(`s${index}`, 0.9));
const truncated = citation.formatCitationBlock(citation.createCitationPanel('query', manySources));
assert.equal((truncated.match(/^- \[/gm) || []).length, 5, 'the block must render the default five sources');
assert.match(truncated, /7 additional sources/, 'the omitted sources must be disclosed');
assert.match(truncated, /Retrieved:/, 'the retrieval timestamp must stay in the block');

// Exactly five qualifying sources must not be reported as truncated.
const exactlyFive = citation.formatCitationBlock(
  citation.createCitationPanel('query', Array.from({ length: 5 }, (_value, index) => source(`e${index}`, 0.9))),
);
assert.doesNotMatch(exactlyFive, /additional source/, 'a complete list must not claim omissions');
assert.equal((exactlyFive.match(/^- \[/gm) || []).length, 5);

// --- 3. filtering boundaries ---------------------------------------------
assert.equal(citation.filterRelevantSources(manySources, 0.5, 0).length, 0, 'a zero limit yields nothing');
assert.equal(citation.filterRelevantSources(manySources, 0.5, 3).length, 3, 'an explicit limit is honoured');
assert.equal(
  citation.filterRelevantSources(manySources, Number.NaN, 5).length,
  5,
  'a non-finite threshold must fall back to the default rather than filtering everything out',
);
assert.equal(
  citation.filterRelevantSources(manySources, 0.5, Number.NaN).length,
  citation.DEFAULT_MAX_CITED_SOURCES,
  'a non-finite limit must fall back to the default',
);
// A source without a usable relevance must never be cited.
const mixed = [source('good', 0.9), { id: 'bad', title: 't', snippet: 's', relevance: Number.NaN, retrievedAt: 1 }];
assert.equal(citation.filterRelevantSources(mixed, 0.5, 5).length, 1, 'a non-finite relevance must be excluded');

// --- 4. rendering degenerate panels --------------------------------------
assert.equal(citation.formatCitationBlock({ query: 'q', sources: [], generatedAt: 0 }), '', 'no sources renders nothing');
assert.equal(
  citation.formatCitationBlock({ query: 'q', sources: [source('only', 0.1)], generatedAt: 0 }),
  '',
  'sources below the threshold render nothing',
);
const untitled = citation.formatCitationBlock({
  query: 'q',
  sources: [{ id: 'x', title: '   ', snippet: '', relevance: 0.9, retrievedAt: 1 }],
  generatedAt: 0,
});
assert.match(untitled, /\(untitled source\)/, 'a blank title must not render as an empty link label');
assert.doesNotMatch(untitled, / - undefined/, 'a blank snippet must not render the string undefined');

// --- 5. budget estimates must stay finite and non-negative ---------------
for (const tokens of [-5000, Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
  const estimate = budget.estimateCost({ provider: 'OpenAI', model: 'gpt-4o' }, tokens);
  assert.equal(estimate.estimatedTokens, 0, `an unusable token count must normalize to zero: ${String(tokens)}`);
  assert.equal(Number.isFinite(estimate.estimatedCost), true, `cost must be finite: ${String(tokens)}`);
  assert.ok(estimate.estimatedCost >= 0, `cost must not be negative: ${String(tokens)}`);
}
const positive = budget.estimateCost({ provider: 'OpenAI', model: 'gpt-4o' }, 10_000);
assert.equal(positive.estimatedTokens, 10_000);
assert.equal(positive.estimatedCost, 0.15, '10000 tokens at 0.015 per 1k is 0.15');
assert.equal(positive.tier, 2);

// A fractional count is floored rather than rounded up into a higher tier.
assert.equal(budget.estimateCost({ provider: 'OpenAI', model: 'gpt-4o' }, 999.9).estimatedTokens, 999);

// An unknown model falls back to the default tier instead of throwing.
const unknown = budget.estimateCost({ provider: 'Custom', model: 'not-in-the-table' }, 1000);
assert.equal(unknown.tier, 2);
assert.ok(unknown.estimatedCost > 0);

// A malformed provider object must not throw.
const malformed = budget.estimateCost({}, 1000);
assert.equal(malformed.provider, 'unknown');
assert.equal(malformed.model, 'unknown');
assert.equal(Number.isFinite(malformed.estimatedCost), true);

// --- 6. routing must always hand back a non-null recommendation ----------
const emptyRoute = budget.recommendBudgetRoute([], 1000, 'cost');
assert.equal(emptyRoute.estimates.length, 0, 'an empty provider list yields no estimates');
assert.equal(emptyRoute.alternates.length, 0);
assert.ok(emptyRoute.recommended !== undefined, 'recommended must never be undefined');
assert.equal(typeof emptyRoute.recommended.provider, 'string');

const providers = [
  { provider: 'OpenAI', model: 'gpt-4o' },
  { provider: 'Ollama', model: 'llama3.2' },
  { provider: 'DeepSeek', model: 'deepseek-chat' },
];
const costRoute = budget.recommendBudgetRoute(providers, 10_000, 'cost');
assert.equal(costRoute.recommended.provider, 'Ollama', 'cost priority must pick the free local model');
assert.equal(costRoute.estimates.length, 3);
assert.ok(costRoute.alternates.length > 0);
assert.equal(costRoute.priority, 'cost');

const speedRoute = budget.recommendBudgetRoute(providers, 10_000, 'speed');
assert.equal(speedRoute.recommended.provider, 'Ollama', 'speed priority must pick the lowest latency');

// A malformed provider list must not throw.
const malformedRoute = budget.recommendBudgetRoute(undefined, 1000, 'balanced');
assert.equal(malformedRoute.estimates.length, 0);
assert.ok(malformedRoute.recommended !== undefined);

// --- 7. both package copies must stay byte-identical ---------------------
for (const module of ['budget.ts', 'citation.ts']) {
  const sharedSource = fs.readFileSync(path.join(repoRoot, 'packages/shared/src', module), 'utf8');
  const androidSource = fs.readFileSync(path.join(repoRoot, 'apps/android/src/shared', module), 'utf8');
  assert.equal(androidSource, sharedSource, `the Android ${module} copy must mirror the shared package`);
}
const citationSource = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/citation.ts'), 'utf8');
assert.match(citationSource, /\[\.\.\.sources\]\.sort/, 'the panel must sort a copy');
assert.doesNotMatch(citationSource, /sources\.sort\(/, 'the in-place sort must not return');

const budgetSource = fs.readFileSync(path.join(repoRoot, 'packages/shared/src/budget.ts'), 'utf8');
assert.match(budgetSource, /function normalizeTokenEstimate/, 'the token normalization helper must stay present');

console.log('CHRIS_STUDIO_V2_4_CITATION_BUDGET_BOUNDS_PASSED');
