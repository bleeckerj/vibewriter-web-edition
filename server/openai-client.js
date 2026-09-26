const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';
const DEFAULT_OPENAI_REASONING_EFFORT = 'none';

function getOpenAIConfig(env = process.env) {
  return {
    model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    reasoningEffort: env.OPENAI_REASONING_EFFORT || DEFAULT_OPENAI_REASONING_EFFORT
  };
}

function isReasoningModel(model) {
  return /^(?:gpt-(?:5|6)(?:[.-]|$)|o\d(?:[.-]|$))/i.test(model);
}

function buildResponsesRequest({
  model,
  system,
  prompt,
  maxTokens,
  temperature,
  reasoningEffort
}) {
  const request = {
    model,
    instructions: system,
    input: prompt,
    max_output_tokens: maxTokens,
    store: false
  };

  if (isReasoningModel(model)) {
    request.reasoning = { effort: reasoningEffort };

    // GPT-5.6 and GPT-6 allow sampling controls when reasoning is disabled.
    // Higher reasoning efforts reject temperature/top_p parameters.
    if (reasoningEffort === 'none') {
      request.temperature = temperature;
    }
  } else {
    request.temperature = temperature;
  }

  return request;
}

async function generateText(openai, options) {
  const response = await openai.responses.create(buildResponsesRequest(options));

  if (typeof response.output_text !== 'string' || response.output_text.length === 0) {
    throw new Error('OpenAI returned no text output');
  }

  return response.output_text;
}

module.exports = {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_REASONING_EFFORT,
  buildResponsesRequest,
  generateText,
  getOpenAIConfig,
  isReasoningModel
};
