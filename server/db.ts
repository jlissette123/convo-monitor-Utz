import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export function getDb() {
  if (!_db) throw new Error("Database not initialized — call initDb() first");
  return _db;
}

export function getPool() {
  return _pool;
}

export async function initDb(databaseUrl: string) {
  _pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  _db = drizzle(_pool, { schema });
  await createTablesIfNeeded(_pool);
  return _db;
}

// Create all tables using raw SQL — no drizzle-kit, no migrations file needed
async function createTablesIfNeeded(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      author_handle TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      url TEXT NOT NULL,
      published_at TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      sentiment_score INTEGER NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      brand_mentions TEXT[] NOT NULL DEFAULT '{}',
      tags TEXT[] NOT NULL DEFAULT '{}',
      engagement_count INTEGER NOT NULL DEFAULT 0,
      flagged_reason TEXT,
      assigned_to TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS draft_replies (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'awaiting',
      generated_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      review_note TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      conversation_id TEXT,
      user_id TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar_initials TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS culture_reviews (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      sentiment_score INTEGER NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      captured_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS db_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
