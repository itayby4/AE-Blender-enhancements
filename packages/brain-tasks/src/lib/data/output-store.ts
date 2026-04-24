import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { TASK_OUTPUT_MAX_BYTES } from '@pipefx/brain-contracts';

export interface TaskOutputStoreOptions {
  rootDir: string;
  maxBytes?: number;
}

export interface TaskOutputStore {
  write(sessionId: string, taskId: string, chunk: string): Promise<void>;
  read(sessionId: string, taskId: string): Promise<string>;
  tail(sessionId: string, taskId: string, bytes: number): Promise<string>;
  pathFor(sessionId: string, taskId: string): string;
  delete(sessionId: string, taskId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export function createTaskOutputStore(opts: TaskOutputStoreOptions): TaskOutputStore {
  const maxBytes = opts.maxBytes ?? TASK_OUTPUT_MAX_BYTES;

  function dirFor(sessionId: string): string {
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(opts.rootDir, safe);
  }

  function pathFor(sessionId: string, taskId: string): string {
    const safeTask = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(dirFor(sessionId), `${safeTask}.txt`);
  }

  async function ensureDir(sessionId: string): Promise<void> {
    await fs.mkdir(dirFor(sessionId), { recursive: true });
  }

  async function maybeRotate(file: string): Promise<void> {
    try {
      const stat = await fs.stat(file);
      if (stat.size > maxBytes) {
        const data = await fs.readFile(file);
        const kept = data.subarray(data.length - maxBytes);
        await fs.writeFile(file, kept);
      }
    } catch {
      // File may not exist yet; no rotation needed.
    }
  }

  return {
    pathFor,

    async write(sessionId, taskId, chunk) {
      await ensureDir(sessionId);
      const file = pathFor(sessionId, taskId);
      await fs.appendFile(file, chunk, 'utf8');
      await maybeRotate(file);
    },

    async read(sessionId, taskId) {
      const file = pathFor(sessionId, taskId);
      if (!existsSync(file)) return '';
      return fs.readFile(file, 'utf8');
    },

    async tail(sessionId, taskId, bytes) {
      const file = pathFor(sessionId, taskId);
      if (!existsSync(file)) return '';
      const stat = await fs.stat(file);
      if (stat.size <= bytes) {
        return fs.readFile(file, 'utf8');
      }
      const fh = await fs.open(file, 'r');
      try {
        const buf = Buffer.alloc(bytes);
        await fh.read(buf, 0, bytes, stat.size - bytes);
        return buf.toString('utf8');
      } finally {
        await fh.close();
      }
    },

    async delete(sessionId, taskId) {
      const file = pathFor(sessionId, taskId);
      try {
        await fs.unlink(file);
      } catch {
        // Ignore — already gone.
      }
    },

    async deleteSession(sessionId) {
      try {
        await fs.rm(dirFor(sessionId), { recursive: true, force: true });
      } catch {
        // Ignore.
      }
    },
  };
}
