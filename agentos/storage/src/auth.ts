// Where Drive access tokens come from: a token in the environment, for
// trying things out, or Google's refresh grant, for runs nobody is watching.

import { StorageError } from './types.ts';

export interface Tokens {
  /** A token to send. */
  token(): Promise<string>;
  /** A new one, after Drive refused the last. */
  refresh(): Promise<string>;
}

/** A token you got yourself. It can't be renewed, so a refusal says to get a new one. */
export function fixedToken(token: () => string): Tokens {
  return {
    token: async () => token(),
    refresh: async () => {
      throw new StorageError('auth', 'Drive refused the access token: it has expired or is wrong. Get a new one.');
    },
  };
}

export interface RefreshOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Default https://oauth2.googleapis.com/token. */
  tokenUrl?: string;
}

/** Google's refresh grant. `options` is called when a token is first needed, so a missing variable surfaces then. */
export function refreshGrant(options: () => RefreshOptions): Tokens {
  let current: { token: string; until: number } | undefined;

  async function renew(): Promise<string> {
    const { clientId, clientSecret, refreshToken, tokenUrl } = options();
    let response: Response;
    try {
      response = await fetch(tokenUrl ?? 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new StorageError('auth', `Google sign-in could not be reached (${(error as Error).message})`);
    }
    const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!response.ok || !body.access_token) {
      throw new StorageError('auth', `Google sign-in failed (${response.status}): ${body.error_description ?? body.error ?? 'no access token came back'}`);
    }
    // Renew a minute early, so a token never expires mid-request.
    current = { token: body.access_token, until: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
    return current.token;
  }

  return {
    token: async () => (current && Date.now() < current.until ? current.token : renew()),
    refresh: renew,
  };
}
