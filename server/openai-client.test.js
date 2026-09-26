const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_OPENAI_MODEL,
  buildResponsesRequest,
  generateText,
  getOpenAIConfig,
  isReasoningModel
} = require('./openai-client');
const { estimateTokenCost, getModelPricing } = require('./openai-pricing');

test('uses GPT-6 Luna with no reasoning by default', () => {
  assert.deepEqual(getOpenAIConfig({}), {
    model: DEFAULT_OPENAI_MODEL,
    reasoningEffort: 'none'
  });
});

test('builds a Responses request for the reasoning-model default', () => {
  assert.deepEqual(buildResponsesRequest({
    model: 'gpt-6-luna',
    system: 'Write a continuation.',
    prompt: 'A door opened.',
    maxTokens: 80,
    temperature: 0.9,
    reasoningEffort: 'none'
  }), {
    model: 'gpt-6-luna',
    instructions: 'Write a continuation.',
    input: 'A door opened.',
    max_output_tokens: 80,
    store: false,
    reasoning: { effort: 'none' },
    temperature: 0.9
  });
});

test('omits sampling controls when reasoning is enabled', () => {
  const request = buildResponsesRequest({
    model: 'gpt-6-luna',
    system: 'Write a continuation.',
    prompt: 'A door opened.',
    maxTokens: 80,
    temperature: 0.9,
    reasoningEffort: 'low'
  });

  assert.equal(request.temperature, undefined);
  assert.deepEqual(request.reasoning, { effort: 'low' });
});

test('extracts text from the Responses API result', async () => {
  let request;
  const client = {
    responses: {
      create: async (requestBody) => {
        request = requestBody;
        return { output_text: 'The door opened.' };
      }
    }
  };

  const text = await generateText(client, {
    model: 'gpt-6-luna',
    system: 'Write a continuation.',
    prompt: 'A door opened.',
    maxTokens: 80,
    temperature: 0.9,
    reasoningEffort: 'none'
  });

  assert.equal(text, 'The door opened.');
  assert.equal(request.max_output_tokens, 80);
  assert.equal(request.store, false);
});

test('preserves compatibility for a configured non-reasoning model', () => {
  assert.equal(isReasoningModel('gpt-4.1-nano-2025-04-14'), false);
  assert.equal(buildResponsesRequest({
    model: 'gpt-4.1-nano-2025-04-14',
    system: 'Write a continuation.',
    prompt: 'A door opened.',
    maxTokens: 80,
    temperature: 0.9,
    reasoningEffort: 'none'
  }).reasoning, undefined);
});

test('estimates current model cost using cached input rates', () => {
  const pricing = getModelPricing('gpt-6-luna');
  assert.equal(pricing.input, 0.1);
  assert.equal(pricing.cachedInput, 0.01);
  assert.equal(pricing.output, 0.5);
  assert.equal(
    estimateTokenCost('gpt-6-luna', 1_000_000, 1_000_000, 100_000),
    0.591
  );
  assert.equal(estimateTokenCost('unknown-model', 100, 100), null);
});
