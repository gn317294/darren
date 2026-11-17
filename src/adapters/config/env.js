export function loadEnv(runtimeEnv) {
  const src = runtimeEnv || (typeof process !== 'undefined' ? process.env : {}) || {};
  return {
    SESSION_SECRET: String(src.SESSION_SECRET || 'dev-only-change-in-production-secret-key-32bytes'),
    INITIAL_FAMILY_PASSWORD: String(src.INITIAL_FAMILY_PASSWORD || 'family-pass'),
    INITIAL_PARENT_PASSWORD: String(src.INITIAL_PARENT_PASSWORD || 'parent-pass'),
    ALLOWED_ORIGIN: String(src.ALLOWED_ORIGIN || ''),
    D1_DB: src.D1_DB
  };
}
