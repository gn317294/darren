// 附錄 A.6 INV-1：唯一讀取環境變數與機密值的模組，絕不暴露給前端或公開 repo
export interface ServerEnv {
  SESSION_SECRET: string;
  INITIAL_FAMILY_PASSWORD: string;
  INITIAL_PARENT_PASSWORD: string;
  ALLOWED_ORIGIN: string;
  D1_DB?: any; // Cloudflare D1 binding (若在 Workers 環境)
}

export function loadEnv(runtimeEnv?: Record<string, any>): ServerEnv {
  const src = runtimeEnv || (typeof process !== 'undefined' ? process.env : {}) || {};
  return {
    SESSION_SECRET: String(src.SESSION_SECRET || 'dev-only-change-in-production-secret-key-32bytes'),
    INITIAL_FAMILY_PASSWORD: String(src.INITIAL_FAMILY_PASSWORD || 'family-pass'),
    INITIAL_PARENT_PASSWORD: String(src.INITIAL_PARENT_PASSWORD || 'parent-pass'),
    ALLOWED_ORIGIN: String(src.ALLOWED_ORIGIN || ''),
    D1_DB: src.D1_DB
  };
}
