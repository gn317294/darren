// 附錄 A.4 埠介面定義（app 層只認得這些介面與 domain，不認得 Hono / D1 / WebCrypto）
import type { DB } from '../domain/types.ts';

export interface Repository {
  load(): Promise<DB>;
  save(db: DB): Promise<void>;
}

export interface Clock {
  today(): string; // YYYY-MM-DD
  now(): number;   // epoch ms
  recentDates(days: number): string[];
  yesterday(): string;
}

export interface Hasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, storedHash: string): Promise<boolean>;
}

export interface SessionPayload {
  authenticated: true;
  parent: boolean;
  iat: number;
}

export interface AppDeps {
  repo: Repository;
  clock: Clock;
  hasher: Hasher;
  newId: () => string;
}

export class RuleError extends Error {
  public readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RuleError';
    this.status = status;
  }
}
