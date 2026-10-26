// Model providers that sit in front of other providers.

import type { ModelProvider, ModelRequest, ModelResponse } from '../src/types.ts';

/**
 * Sends each request to a provider by the model name's prefix
 * (`anthropic/claude-opus-5-5`, `local/llama`), so cards can mix providers.
 * Names without a prefix go to `fallback`.
 */
export function routeModels(routes: Record<string, ModelProvider>, fallback?: ModelProvider): ModelProvider {
  return {
    complete(request: ModelRequest): Promise<ModelResponse> {
      const slash = request.model.indexOf('/');
      const provider = slash > 0 ? routes[request.model.slice(0, slash)] : fallback;
      if (!provider) return Promise.reject(new Error(`no model provider for \`${request.model}\``));
      return provider.complete(request);
    },
  };
}

/**
 * A provider that answers from your own function: for tests, demos, and
 * trying a team's wiring without spending anything.
 */
export function scriptedModels(
  answer: (request: ModelRequest) => string | ModelResponse | Promise<string | ModelResponse>,
): ModelProvider {
  return {
    async complete(request: ModelRequest): Promise<ModelResponse> {
      const reply = await answer(request);
      return typeof reply === 'string' ? { text: reply, model: request.model, cost_usd: 0 } : reply;
    },
  };
}
