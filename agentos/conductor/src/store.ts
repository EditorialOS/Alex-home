// Where missions are kept between steps. A mission waiting on a person can sit
// for days: the file store keeps it on disk so any later process can resume it.

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Mission, MissionStore } from './types.ts';

export class MemoryStore implements MissionStore {
  private missions = new Map<string, Mission>();

  async load(id: string): Promise<Mission | undefined> {
    const mission = this.missions.get(id);
    return mission && structuredClone(mission);
  }

  async save(mission: Mission): Promise<void> {
    this.missions.set(mission.id, structuredClone(mission));
  }

  async list(): Promise<Mission[]> {
    return [...this.missions.values()].map((mission) => structuredClone(mission));
  }
}

/** One JSON file per mission, written whole and atomically. */
export class FileStore implements MissionStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async load(id: string): Promise<Mission | undefined> {
    if (!/^[\w.-]+$/.test(id)) return undefined;
    try {
      return JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8')) as Mission;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async save(mission: Mission): Promise<void> {
    if (!/^[\w.-]+$/.test(mission.id)) throw new Error(`a mission id is letters, digits, dots and dashes, not \`${mission.id}\``);
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, `${mission.id}.json`);
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(mission, null, 2)}\n`);
    await rename(temp, path);
  }

  async list(): Promise<Mission[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const missions = await Promise.all(
      names.filter((name) => name.endsWith('.json')).map((name) => this.load(name.slice(0, -5))),
    );
    return missions
      .filter((mission): mission is Mission => mission !== undefined)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
