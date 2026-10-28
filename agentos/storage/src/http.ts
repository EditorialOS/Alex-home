// Requests to Drive: the sign-in header, a timeout, waits when Drive says to
// slow down, and errors that say what went wrong. A write is never sent twice
// after a failure that leaves it unknown whether the first one landed.

import type { Tokens } from './auth.ts';
import { StorageError } from './types.ts';
import type { ErrorCode } from './types.ts';

export interface HttpOptions {
  tokens: Tokens;
  /** Per attempt. Default 60 s. */
  timeoutMs?: number;
  /** How many times a request is sent again. Default 3. */
  retries?: number;
  /** How to wait between attempts; tests pass their own. */
  sleep?: (ms: number) => Promise<void>;
}

export interface Call {
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** A read: safe to send again after a server error or a dropped connection. */
  safe?: boolean;
}

const RATE_LIMITS = ['rateLimitExceeded', 'userRateLimitExceeded'];
const MAX_WAIT_MS = 60_000;
const NOT_SENT_AGAIN = '. It was not sent again, since it may have landed: look before you write it again';

export class Http {
  private readonly tokens: Tokens;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpOptions) {
    this.tokens = options.tokens;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.retries = options.retries ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async send(method: string, url: string, call: Call = {}): Promise<Response> {
    const target = new URL(url);
    for (const [key, value] of Object.entries(call.query ?? {})) target.searchParams.set(key, String(value));
    const safe = call.safe === true;
    let token = await this.tokens.token();
    let renewed = false;
    let retried = 0;
    for (;;) {
      let response: Response;
      try {
        response = await fetch(target, {
          method,
          headers: { ...call.headers, authorization: `Bearer ${token}` },
          body: call.body as BodyInit | undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (safe && retried < this.retries) {
          await this.sleep(backoff(retried++));
          continue;
        }
        throw new StorageError('provider', `Drive could not be reached (${(error as Error).message})${safe ? '' : NOT_SENT_AGAIN}`);
      }
      if (response.ok) return response;
      if (response.status === 401 && !renewed) {
        renewed = true;
        await response.body?.cancel();
        token = await this.tokens.refresh();
        continue;
      }
      const text = await response.text();
      const wait = retried < this.retries ? waitFor(response, text, safe) : undefined;
      if (wait !== undefined) {
        await this.sleep(wait === 0 ? backoff(retried) : wait);
        retried += 1;
        continue;
      }
      throw errorOf(response.status, text, safe);
    }
  }

  async json<T>(method: string, url: string, call?: Call): Promise<T> {
    return (await (await this.send(method, url, call)).json()) as T;
  }

  async bytes(method: string, url: string, call?: Call): Promise<Uint8Array> {
    return new Uint8Array(await (await this.send(method, url, call)).arrayBuffer());
  }
}

/** How long to wait before trying again (0: the usual backoff), or undefined when it should not be tried again. */
function waitFor(response: Response, text: string, safe: boolean): number | undefined {
  const limited = response.status === 429 || (response.status === 403 && RATE_LIMITS.includes(reasonOf(text)));
  if (!limited && !(safe && response.status >= 500)) return undefined;
  const header = response.headers.get('retry-after');
  if (!header) return 0;
  const ms = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), MAX_WAIT_MS) : 0;
}

function backoff(retried: number): number {
  return 1000 * 2 ** retried;
}

function errorOf(status: number, text: string, safe: boolean): StorageError {
  const code: ErrorCode = status === 404 ? 'not-found' : status === 401 || status === 403 ? 'auth' : 'provider';
  return new StorageError(code, `Drive answered ${status}: ${messageOf(text)}${!safe && status >= 500 ? NOT_SENT_AGAIN : ''}`);
}

function messageOf(text: string): string {
  try {
    const message = (JSON.parse(text) as { error?: { message?: string } }).error?.message;
    if (message) return message;
  } catch {
    // not JSON: use the text itself
  }
  return text.slice(0, 200) || 'no details';
}

function reasonOf(text: string): string {
  try {
    return (JSON.parse(text) as { error?: { errors?: { reason?: string }[] } }).error?.errors?.[0]?.reason ?? '';
  } catch {
    return '';
  }
}
