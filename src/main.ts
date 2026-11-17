import { webcrypto } from 'node:crypto';
const _crypto = globalThis.crypto || webcrypto;
// 附錄 A.2 main.ts：依賴注入組裝（將具體 adapters 注入 app usecases，並支援 Cloudflare Workers 與 Node.js 雙環境啟動）
import { loadEnv } from './adapters/config/env.ts';
import { Pbkdf2Hasher } from './adapters/auth/hasher.ts';
import { SessionManager } from './adapters/auth/sessions.ts';
import { createInitialDB } from './adapters/db/seed.ts';
import { D1Repository, InMemoryRepository } from './adapters/db/repo.d1.ts';
import { createServer } from './adapters/http/server.ts';
import type { AppDeps, Clock, Repository } from './app/ports.ts';

export class SystemClock implements Clock {
  today(): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
  }
  now(): number {
    return Date.now();
  }
  yesterday(): string {
    const d = new Date(this.today() + 'T12:00:00+08:00');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  recentDates(days: number): string[] {
    const base = new Date(this.today() + 'T12:00:00+08:00');
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
  }
}

export async function bootstrapApp(runtimeEnv?: Record<string, any>, customRepo?: Repository) {
  const env = loadEnv(runtimeEnv);
  const hasher = new Pbkdf2Hasher();
  const clock = new SystemClock();
  const sessions = new SessionManager(env.SESSION_SECRET);

  const buildSeed = async () => {
    const familyHash = await hasher.hash(env.INITIAL_FAMILY_PASSWORD);
    const parentHash = await hasher.hash(env.INITIAL_PARENT_PASSWORD);
    return createInitialDB(familyHash, parentHash, clock.now());
  };

  const repo: Repository = customRepo
    ? customRepo
    : env.D1_DB
      ? new D1Repository(env.D1_DB, buildSeed)
      : new InMemoryRepository(await buildSeed());

  const deps: AppDeps = {
    repo,
    clock,
    hasher,
    newId: () => _crypto.randomUUID()
  };

  return {
    deps,
    sessions,
    server: createServer({ deps, sessions, allowedOrigin: env.ALLOWED_ORIGIN })
  };
}

// Cloudflare Workers 預設匯出
let workerPromise: ReturnType<typeof bootstrapApp> | null = null;
export default {
  async fetch(req: Request, env: Record<string, any>): Promise<Response> {
    if (!workerPromise) {
      workerPromise = bootstrapApp(env);
    }
    const app = await workerPromise;
    return app.server.fetch(req);
  }
};
