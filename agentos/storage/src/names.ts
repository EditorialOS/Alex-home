// Names without overwriting: filing patterns ("{date}-{name}"), versions
// ("post v2.md"), and finding the newest of them. All pure, all by name, so
// the same rules hold whatever is in the folder.

import { StorageError } from './types.ts';

const PLACEHOLDERS = ['name', 'date', 'year', 'month'];
const DIGITS: Record<string, string> = { date: '\\d{4}-\\d{2}-\\d{2}', year: '\\d{4}', month: '\\d{2}' };

/** What is wrong with a filing pattern, if anything. */
export function checkPattern(pattern: string): string | undefined {
  if (pattern.split('{name}').length !== 2) return 'must contain {name} once';
  if (pattern.includes('/')) return "can't contain /: folders come from the address";
  const unknown = [...pattern.matchAll(/\{([^}]*)\}/g)].map((match) => match[1]!).filter((key) => !PLACEHOLDERS.includes(key));
  if (unknown.length > 0) return `has ${unknown.map((key) => `{${key}}`).join(', ')}: the placeholders are {name}, {date}, {year} and {month}`;
  return undefined;
}

/** A name filed by a pattern, with dates in the machine's time zone. */
export function fileName(pattern: string, name: string, now: Date): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const values: Record<string, string> = { name, date: `${year}-${month}-${day}`, year, month };
  return pattern.replace(/\{(name|date|year|month)\}/g, (_, key: string) => values[key]!);
}

/** `post.md` as stem `post` and extension `.md`. */
function split(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
}

/** The name of version `n`: `post.md` is version 1, then `post v2.md`, `post v3.md`. */
export function versionName(name: string, n: number): string {
  if (n <= 1) return name;
  const { stem, ext } = split(name);
  return `${stem} v${n}${ext}`;
}

/** The version number `candidate` has as a version of `name`, or undefined if it isn't one. */
export function versionOf(name: string, candidate: string): number | undefined {
  const { stem, ext } = split(name);
  const match = new RegExp(`^${escape(stem)}(?: v(\\d+))?${escape(ext)}$`).exec(candidate);
  if (!match) return undefined;
  return match[1] === undefined ? 1 : Number(match[1]);
}

/**
 * The newest of `candidates` that is a version of `name` filed by `pattern`:
 * by the dates in its name, then by its version number.
 */
export function newest(name: string, pattern: string | undefined, candidates: string[]): string | undefined {
  const { stem, ext } = split(name);
  let dates = 0;
  const shape = (pattern ?? '{name}')
    .split(/(\{(?:name|date|year|month)\})/)
    .map((part) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      if (key === 'name') return `${escape(stem)}(?: v(?<version>\\d+))?${escape(ext)}`;
      if (key) return `(?<d${dates++}>${DIGITS[key]})`;
      return escape(part);
    })
    .join('');
  const matcher = new RegExp(`^${shape}$`);
  let best: { name: string; key: string } | undefined;
  for (const candidate of candidates) {
    const match = matcher.exec(candidate);
    if (!match) continue;
    const groups = match.groups ?? {};
    const when = Array.from({ length: dates }, (_, index) => groups[`d${index}`]).join(' ');
    const key = `${when}|${(groups.version ?? '1').padStart(6, '0')}`;
    if (!best || key > best.key) best = { name: candidate, key };
  }
  return best?.name;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Checks a receipt label fits Drive's 124 bytes for a property's key and value together. */
export function checkLabel(key: string, value: string): void {
  if (Buffer.byteLength(key) + Buffer.byteLength(value) > 124) {
    throw new StorageError('usage', `the receipt's \`${key.replace(/^storage_/, '')}\` is too long for Drive (keep it under ${124 - Buffer.byteLength(key)} bytes)`);
  }
}
