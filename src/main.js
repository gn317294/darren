import { webcrypto } from 'node:crypto';
const _crypto = globalThis.crypto || webcrypto;
import { loadEnv } from './adapters/config/env.js';
import { Pbkdf2Hasher } from './adapters/auth/hasher.js';
import { SessionManager } from './adapters/auth/sessions.js';
import { createInitialDB } from './adapters/db/seed.js';
import { D1Repository, InMemoryRepository } from './adapters/db/repo.d1.js';
import { createServer } from './adapters/http/server.js';

export class SystemClock {
  today() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
  }
  now() {
    return Date.now();
  }
  yesterday() {
    const d = new Date(this.today() + 'T12:00:00+08:00');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  recentDates(days) {
    const base = new Date(this.today() + 'T12:00:00+08:00');
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - i);
      return d.toISOString().slice(0, 10);
    });
  }
}

export async function bootstrapApp(runtimeEnv, customRepo) {
  const env = loadEnv(runtimeEnv);
  const hasher = new Pbkdf2Hasher();
  const clock = new SystemClock();
  const sessions = new SessionManager(env.SESSION_SECRET);

  const buildSeed = async () => {
    const familyHash = await hasher.hash(env.INITIAL_FAMILY_PASSWORD);
    const parentHash = await hasher.hash(env.INITIAL_PARENT_PASSWORD);
    return createInitialDB(familyHash, parentHash, clock.now());
  };

  const repo = customRepo
    ? customRepo
    : env.D1_DB
      ? new D1Repository(env.D1_DB, buildSeed)
      : new InMemoryRepository(await buildSeed());

  const deps = {
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

let workerPromise = null;
export default {
  async fetch(req, env) {
    if (!workerPromise) {
      workerPromise = bootstrapApp(env);
    }
    const app = await workerPromise;
    return app.server.fetch(req);
  }
};
