// Runs model cards on Claude. A card names its model in its plug block
// (`model: claude-opus-5-5`, or `anthropic/claude-opus-5-5` when the conductor
// routes several providers by prefix).

import Anthropic from '@anthropic-ai/sdk';
import { RefusalError } from '../types.ts';
import type { ModelProvider, ModelRequest, ModelResponse } from '../types.ts';

export interface AnthropicModelsOptions {
  /** A client of your own (a proxy, a gateway, a test server). */
  client?: Anthropic;
  apiKey?: string;
  baseURL?: string;
  /**
   * Ask the API to re-run a declined request on Anthropic's recommended
   * fallback model, inside the same call. Default true, for the models that
   * support it.
   */
  serverFallbacks?: boolean;
  /** Used when a card sets no `max_tokens`. Default 16000. */
  maxTokens?: number;
}

/** USD per million tokens: input, output, cache write (5 minutes), cache read. */
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-fable-5-1': [10, 50, 12.5, 0.25],
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.2],
  // The rate card for prompts of 100K tokens or fewer.
  'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.01],
};

/** Models with a server-side fallback on the Claude API. */
const FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class AnthropicModels implements ModelProvider {
  private client?: Anthropic;
  private readonly options: AnthropicModelsOptions;

  constructor(options: AnthropicModelsOptions = {}) {
    this.options = options;
    this.client = options.client;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.client ??= new Anthropic({ apiKey: this.options.apiKey, baseURL: this.options.baseURL });
    const model = request.model.replace(/^anthropic\//, '');
    const fallback = (this.options.serverFallbacks ?? true) && FALLBACK_MODELS.includes(model);
    // Streamed, so a card can ask for long replies without hitting the
    // client's ten-minute limit on a single response; we keep the final message.
    const stream = this.client.beta.messages.stream({
      model,
      max_tokens: request.max_tokens ?? this.options.maxTokens ?? 16_000,
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.prompt }],
      output_config: {
        effort: request.effort ?? 'medium',
        ...(request.schema ? { format: { type: 'json_schema', schema: request.schema } } : {}),
      },
      ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') {
      const category = response.stop_details?.category ?? null;
      throw new RefusalError(`${response.model} declined the task${category ? ` (${category})` : ''}`, category);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error(`${response.model} ran out of output tokens; raise the card's plug.max_tokens`);
    }
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    return { text, model: response.model, cost_usd: costOf(response.model, response.usage) };
  }
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** What a call cost, or undefined for a model without a known price. */
export function costOf(model: string, usage: Usage): number | undefined {
  const price = PRICES[model.replace(/-\d{8}$/, '')];
  if (!price) return undefined;
  const [input, output, cacheWrite, cacheRead] = price;
  const usd =
    usage.input_tokens * input +
    usage.output_tokens * output +
    (usage.cache_creation_input_tokens ?? 0) * cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * cacheRead;
  return usd / 1_000_000;
}
