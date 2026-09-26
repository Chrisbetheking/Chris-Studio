// Regression tests: provider usage normalization must read every documented shape.
//
// Two defects were found by probing real payload shapes:
//
//  1. Detail objects were only read from the root and from the Responses API
//     names (`input_tokens_details` / `output_tokens_details`). OpenAI's
//     chat-completions API nests them under `usage.prompt_tokens_details` and
//     `usage.completion_tokens_details`, so cache-hit tokens and reasoning
//     tokens silently read as zero. The spend dashboard then under-reported
//     cached savings and omitted reasoning usage entirely.
//
//  2. Reasoning tokens were billed *in addition* to the output total even though
//     OpenAI already includes them in `completion_tokens`, charging the same
//     tokens twice whenever a rate card declared `reasoningUsdPerMillion`.
const assert = require('node:assert/strict');
const path = require('node:path');

const buildRoot = path.resolve(__dirname, '../../../../.tokenfence-test-build');
const telemetry = require(path.join(buildRoot, 'features/providers/providerTelemetry.js'));
const { normalizeProviderUsage } = telemetry;

const RATE_CARD = {
  inputUsdPerMillion: 2,
  outputUsdPerMillion: 8,
  cachedInputUsdPerMillion: 0.5,
};

// --- 1. the pre-existing contract must not move ---------------------------
const legacy = normalizeProviderUsage('openai', {
  prompt_tokens: 1200,
  completion_tokens: 300,
  total_tokens: 1500,
  input_tokens_details: { cached_tokens: 200 },
}, { model: 'test-model', rateCard: { inputUsdPerMillion: 1, outputUsdPerMillion: 4, cachedInputUsdPerMillion: 0.25 } });
assert.equal(legacy.totalTokens, 1500);
assert.equal(legacy.cachedInputTokens, 200);
assert.equal(legacy.estimatedCostUsd, 0.00225, 'the flat input_tokens_details shape must keep working');

// --- 2. chat-completions nesting must be read ----------------------------
const chat = normalizeProviderUsage('openai', {
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 2000,
    total_tokens: 3000,
    prompt_tokens_details: { cached_tokens: 600 },
    completion_tokens_details: { reasoning_tokens: 1500 },
  },
}, { model: 'o3', rateCard: RATE_CARD });
assert.equal(chat.inputTokens, 1000);
assert.equal(chat.outputTokens, 2000);
assert.equal(chat.cachedInputTokens, 600, 'usage.prompt_tokens_details.cached_tokens must be read');
assert.equal(chat.reasoningTokens, 1500, 'usage.completion_tokens_details.reasoning_tokens must be read');
assert.equal(chat.source, 'reported');

// reasoning is contained in completion_tokens, so it must not be billed twice:
// uncached 400 * 2 + output 2000 * 8 + cached 600 * 0.5 = 0.0171
assert.equal(chat.estimatedCostUsd, 0.0171, 'reasoning tokens inside the output total must not be double billed');

// --- 3. the Responses API shape must keep working ------------------------
const responses = normalizeProviderUsage('openai', {
  usage: {
    input_tokens: 1000,
    output_tokens: 2000,
    input_tokens_details: { cached_tokens: 600 },
    output_tokens_details: { reasoning_tokens: 1500 },
  },
}, { model: 'o3', rateCard: RATE_CARD });
assert.equal(responses.cachedInputTokens, 600);
assert.equal(responses.reasoningTokens, 1500);
assert.equal(responses.estimatedCostUsd, 0.0171);

// --- 4. reasoning reported outside the output total is billed ------------
const separate = normalizeProviderUsage('custom', {
  input_tokens: 100,
  output_tokens: 50,
  reasoning_tokens: 80,
}, { rateCard: { inputUsdPerMillion: 1, outputUsdPerMillion: 10, reasoningUsdPerMillion: 20 } });
// 100 * 1 + 50 * 10 + (80 - 50) * 20 = 1200 micro-dollars
assert.equal(separate.reasoningTokens, 80);
assert.equal(separate.estimatedCostUsd, 0.0012, 'reasoning beyond the output count must be billed at its own rate');

// Reasoning equal to or below the output count must never add cost.
const contained = normalizeProviderUsage('custom', {
  input_tokens: 100,
  output_tokens: 100,
  reasoning_tokens: 100,
}, { rateCard: { inputUsdPerMillion: 1, outputUsdPerMillion: 10, reasoningUsdPerMillion: 20 } });
assert.equal(contained.estimatedCostUsd, 0.0011, 'reasoning contained in the output total adds nothing');

// --- 5. other provider dialects ------------------------------------------
const gemini = normalizeProviderUsage('gemini', {
  usage_metadata: {
    promptTokenCount: 500,
    candidatesTokenCount: 250,
    totalTokenCount: 750,
    cachedContentTokenCount: 100,
    cached_tokens: 100,
  },
}, { model: 'gemini-2', rateCard: RATE_CARD });
assert.equal(gemini.inputTokens, 500);
assert.equal(gemini.outputTokens, 250);
assert.equal(gemini.totalTokens, 750);

const anthropic = normalizeProviderUsage('anthropic', {
  usage: { input_tokens: 800, output_tokens: 400, cache_read_input_tokens: 300 },
}, { model: 'claude', rateCard: RATE_CARD });
assert.equal(anthropic.inputTokens, 800);
assert.equal(anthropic.outputTokens, 400);
assert.equal(anthropic.cachedInputTokens, 300, 'cache_read_input_tokens must be recognized');
assert.equal(anthropic.estimatedCostUsd, 0.00435, 'uncached 500*2 + output 400*8 + cached 300*0.5');

// --- 6. unknown or missing usage stays explicit -------------------------
const missing = normalizeProviderUsage('openai', {}, {});
assert.equal(missing.source, 'unavailable');
assert.equal(missing.totalTokens, 0);
assert.equal(missing.estimatedCostUsd, undefined, 'no rate card or usage must not invent a cost');

const partial = normalizeProviderUsage('openai', { usage: { prompt_tokens: 100 } }, { rateCard: RATE_CARD });
assert.equal(partial.source, 'partial', 'a half-reported usage must be labelled partial');
assert.equal(partial.outputTokens, 0);

// --- 7. malformed input must not throw ----------------------------------
for (const raw of [null, undefined, 'text', 42, [], { usage: null }]) {
  const result = normalizeProviderUsage('openai', raw, { rateCard: RATE_CARD });
  assert.equal(typeof result.totalTokens, 'number');
  assert.equal(Number.isFinite(result.totalTokens), true);
  assert.ok(result.totalTokens >= 0);
}

// --- 8. cost must stay a finite, non-negative number ---------------------
const odd = normalizeProviderUsage('openai', {
  usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 999 } },
}, { rateCard: RATE_CARD });
assert.ok(Number.isFinite(odd.estimatedCostUsd) && odd.estimatedCostUsd >= 0,
  'a cache count above the input count must not produce a negative cost');

console.log('CHRIS_STUDIO_V2_4_PROVIDER_USAGE_SHAPES_PASSED');
