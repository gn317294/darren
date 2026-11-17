export class InMemoryRepository {
  constructor(initialState) {
    this.state = structuredClone(initialState);
  }
  async load() {
    return structuredClone(this.state);
  }
  async save(db) {
    this.state = structuredClone(db);
  }
}

export class D1Repository {
  constructor(d1, fallbackSeed) {
    this.d1 = d1;
    this.fallbackSeed = fallbackSeed;
    this.initialized = false;
  }

  async ensureTable() {
    if (this.initialized) return;
    await this.d1
      .prepare(
        `CREATE TABLE IF NOT EXISTS family_state (
           id INTEGER PRIMARY KEY CHECK (id = 1),
           payload TEXT NOT NULL,
           updated_at INTEGER NOT NULL
         )`
      )
      .run();
    this.initialized = true;
  }

  async load() {
    await this.ensureTable();
    const row = await this.d1.prepare(`SELECT payload FROM family_state WHERE id = 1`).first();
    if (!row || !row.payload) {
      const seed = await this.fallbackSeed();
      await this.save(seed);
      return seed;
    }
    return JSON.parse(row.payload);
  }

  async save(db) {
    await this.ensureTable();
    const json = JSON.stringify(db);
    await this.d1
      .prepare(
        `INSERT INTO family_state (id, payload, updated_at)
         VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
      )
      .bind(json, db.updatedAt || Date.now())
      .run();
  }
}
