// A folder as one Markdown document: each file under a heading with its
// address and revision, then what was left out and why.

import type { Entry } from './types.ts';

export function formatBundle(folder: Entry, included: { entry: Entry; text: string }[], leftOut: { entry: Entry; why: string }[], at: Date): string {
  const name = (entry: Entry) => (folder.path === '' ? entry.path : entry.path.slice(folder.path.length + 1));
  const lines = [`# ${folder.uri}`, '', `${included.length} ${included.length === 1 ? 'file' : 'files'}, as of ${at.toISOString().slice(0, 16)}Z.`];
  for (const { entry, text } of included) {
    lines.push('', '---', '', `## ${name(entry)}`, '', `\`${entry.uri}\` · revision ${entry.revision}`, '', text.trimEnd());
  }
  if (leftOut.length > 0) {
    lines.push('', '---', '', '## Left out', '');
    for (const { entry, why } of leftOut) lines.push(`- ${name(entry)}: ${why}`);
  }
  return `${lines.join('\n')}\n`;
}
