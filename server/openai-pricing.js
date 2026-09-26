const MODEL_PRICING = [
  {
    pattern: /^gpt-6-luna(?:$|-)/i,
    input: 0.1,
    cachedInput: 0.01,
    output: 0.5
  },
  {
    pattern: /^gpt-5\.6-luna(?:$|-)/i,
    input: 0.2,
    cachedInput: 0.02,
    output: 1.2
  },
  {
    pattern: /^gpt-5\.4-nano(?:$|-)/i,
    input: 0.2,
    cachedInput: 0.02,
    output: 1.25
  },
  {
    pattern: /^gpt-4\.1-nano(?:$|-)/i,
    input: 0.1,
    cachedInput: 0.025,
    output: 0.4
  },
  {
    pattern: /^gpt-4\.1-mini(?:$|-)/i,
    input: 0.4,
    cachedInput: 0.1,
    output: 1.6
  },
  {
    pattern: /^gpt-4\.1(?:$|-)/i,
    input: 2,
    cachedInput: 0.5,
    output: 8
  }
];

function getModelPricing(model) {
  return MODEL_PRICING.find(({ pattern }) => pattern.test(model)) || null;
}

function estimateTokenCost(model, inputTokens, outputTokens, cachedInputTokens = 0) {
  const pricing = getModelPricing(model);
  if (!pricing) return null;

  const cachedTokens = Math.min(inputTokens, cachedInputTokens);
  const uncachedTokens = Math.max(0, inputTokens - cachedTokens);
  const inputCost = (
    (uncachedTokens / 1_000_000) * pricing.input
    + (cachedTokens / 1_000_000) * pricing.cachedInput
  );

  return inputCost + ((outputTokens / 1_000_000) * pricing.output);
}

module.exports = {
  estimateTokenCost,
  getModelPricing
};
