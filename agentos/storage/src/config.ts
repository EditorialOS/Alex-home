// storage.yaml: one Google sign-in and the folders it mounts. A config with
// any mistake is refused whole, with every reason. Secrets are never written
// in it: it names environment variables, looked up when Drive is first called.

import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { fixedToken, refreshGrant } from './auth.ts';
import type { Tokens } from './auth.ts';
import { DriveDriver } from './drive.ts';
import { Http } from './http.ts';
import type { HttpOptions } from './http.ts';
import { Storage } from './storage.ts';
import { StorageError } from './types.ts';
import type { Access } from './types.ts';
import { MOUNT_NAME } from './uri.ts';

export interface DriveConfig {
  token?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  api_url?: string;
  token_url?: string;
}

export interface MountConfig {
  name: string;
  /** A Drive folder id. */
  folder: string;
  access: Access;
}

export interface Config {
  file: string;
  drive: DriveConfig;
  mounts: MountConfig[];
}

const DRIVE_FIELDS = ['token', 'client_id', 'client_secret', 'refresh_token', 'api_url', 'token_url'];
const REFRESH_FIELDS = ['client_id', 'client_secret', 'refresh_token'] as const;
const SECRETS = ['token', 'client_secret', 'refresh_token'];
const MOUNT_FIELDS = ['folder', 'access'];
const VARIABLE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;
const FOLDER_ID = /^[A-Za-z0-9_-]+$/;

export function defaultConfigFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.STORAGE_CONFIG || 'storage.yaml';
}

export async function loadConfig(file: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new StorageError('config', `there is no config at ${file}. Copy storage.example.yaml there, or pass --config`);
    }
    throw error;
  }
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (error) {
    throw new StorageError('config', `${file} is not valid YAML: ${(error as Error).message}`);
  }
  const problems: string[] = [];
  const top = record(raw, 'the file', problems);
  unknownFields(top, ['drive', 'mounts'], '', problems);
  const drive = driveConfig(top.drive, problems);
  const mounts = mountConfigs(top.mounts, problems);
  if (problems.length > 0) {
    throw new StorageError('config', `${file} has ${problems.length === 1 ? 'a mistake' : `${problems.length} mistakes`}:\n  - ${problems.join('\n  - ')}`);
  }
  return { file, drive, mounts };
}

/** The storage a config describes. Nothing is checked with Google until the first call. */
export function openStorage(config: Config, env: NodeJS.ProcessEnv = process.env, http: Omit<HttpOptions, 'tokens'> = {}): Storage {
  const client = new Http({ ...http, tokens: tokensFor(config.drive, env) });
  return new Storage(
    config.mounts.map((mount) => ({
      name: mount.name,
      access: mount.access,
      driver: new DriveDriver({ http: client, folder: mount.folder, apiUrl: config.drive.api_url && value(config.drive.api_url, 'api_url', env) }),
    })),
  );
}

export async function loadStorage(file: string = defaultConfigFile(), env: NodeJS.ProcessEnv = process.env): Promise<Storage> {
  return openStorage(await loadConfig(file), env);
}

/** How the config signs in, and the environment variables it needs that aren't set. */
export function signIn(config: Config, env: NodeJS.ProcessEnv = process.env): { method: 'token' | 'refresh token'; missing: string[] } {
  const fields = config.drive.token !== undefined ? ['token'] : [...REFRESH_FIELDS];
  const missing = fields
    .map((field) => VARIABLE.exec(config.drive[field as keyof DriveConfig] ?? '')?.[1])
    .filter((name): name is string => name !== undefined && !env[name])
    .map((name) => `$${name}`);
  return { method: config.drive.token !== undefined ? 'token' : 'refresh token', missing };
}

function tokensFor(drive: DriveConfig, env: NodeJS.ProcessEnv): Tokens {
  if (drive.token !== undefined) return fixedToken(() => value(drive.token!, 'token', env));
  return refreshGrant(() => ({
    clientId: value(drive.client_id!, 'client_id', env),
    clientSecret: value(drive.client_secret!, 'client_secret', env),
    refreshToken: value(drive.refresh_token!, 'refresh_token', env),
    tokenUrl: drive.token_url && value(drive.token_url, 'token_url', env),
  }));
}

/** A field's value, with a `$NAME` reference looked up in the environment. */
function value(text: string, field: string, env: NodeJS.ProcessEnv): string {
  const name = VARIABLE.exec(text)?.[1];
  if (name === undefined) return text;
  const found = env[name];
  if (!found) throw new StorageError('config', `drive.${field} names $${name}, and the environment has no $${name}`);
  return found;
}

function driveConfig(raw: unknown, problems: string[]): DriveConfig {
  if (raw === undefined) {
    problems.push('there is no `drive:` section: it says how to sign in to Google');
    return {};
  }
  const drive = record(raw, '`drive`', problems);
  unknownFields(drive, DRIVE_FIELDS, 'drive.', problems);
  const config: DriveConfig = {};
  for (const field of DRIVE_FIELDS) {
    const text = drive[field];
    if (text === undefined) continue;
    if (typeof text !== 'string' || text === '') {
      problems.push(`\`drive.${field}\` must be text`);
      continue;
    }
    if (SECRETS.includes(field) && !VARIABLE.test(text)) {
      problems.push(`\`drive.${field}\` is a secret, so it must name an environment variable, such as $GDRIVE_${field.toUpperCase()}, not hold the value`);
    }
    config[field as keyof DriveConfig] = text;
  }
  const refresh = REFRESH_FIELDS.filter((field) => config[field] !== undefined);
  if (config.token !== undefined && refresh.length > 0) {
    problems.push('`drive` has a token and refresh-token fields: use one way to sign in, not both');
  } else if (config.token === undefined && refresh.length < REFRESH_FIELDS.length) {
    const missing = REFRESH_FIELDS.filter((field) => config[field] === undefined).map((field) => `\`${field}\``);
    problems.push(
      refresh.length === 0
        ? '`drive` needs a way to sign in: `token`, or `client_id`, `client_secret` and `refresh_token`'
        : `\`drive\` signs in with a refresh token but has no ${missing.join(' or ')}`,
    );
  }
  return config;
}

function mountConfigs(raw: unknown, problems: string[]): MountConfig[] {
  if (raw === undefined) {
    problems.push('there is no `mounts:` section: it names the Drive folders to use');
    return [];
  }
  const mounts: MountConfig[] = [];
  for (const [name, rawMount] of Object.entries(record(raw, '`mounts`', problems))) {
    const where = `\`mounts.${name}\``;
    if (!MOUNT_NAME.test(name)) problems.push(`${where}: a mount name is lowercase letters, digits, - and _`);
    const mount = record(rawMount, where, problems);
    unknownFields(mount, MOUNT_FIELDS, `mounts.${name}.`, problems);
    const folder = folderId(mount.folder);
    if (folder === undefined) problems.push(`${where} needs a \`folder\`: a Drive folder's id or its link, or \`root\` for My Drive`);
    const access = mount.access ?? 'read';
    if (access !== 'read' && access !== 'write') problems.push(`${where}: \`access\` is \`read\` or \`write\``);
    mounts.push({ name, folder: folder ?? '', access: access === 'write' ? 'write' : 'read' });
  }
  if (mounts.length === 0 && !problems.some((problem) => problem.includes('`mounts'))) problems.push('`mounts` names no folders');
  return mounts;
}

/** A folder id, from an id or a folder's link (https://drive.google.com/drive/folders/<id>). */
function folderId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const link = /^https:\/\/drive\.google\.com\/.*\/folders\/([A-Za-z0-9_-]+)/.exec(raw);
  if (link) return link[1];
  return FOLDER_ID.test(raw) ? raw : undefined;
}

function record(raw: unknown, what: string, problems: string[]): Record<string, unknown> {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  problems.push(`${what} must be a set of \`name: value\` lines`);
  return {};
}

function unknownFields(raw: Record<string, unknown>, known: string[], prefix: string, problems: string[]): void {
  for (const field of Object.keys(raw)) {
    if (!known.includes(field)) problems.push(`unknown field \`${prefix}${field}\``);
  }
}
