import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

// Next dev reloads modules on every edit; without this the process would open a
// new SQLite handle each time and eventually exhaust file descriptors.
const globalForDb = globalThis as unknown as { __sqlite?: Database.Database };

const sqlite =
  globalForDb.__sqlite ??
  (() => {
    const conn = new Database(DB_PATH);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    return conn;
  })();

if (process.env.NODE_ENV !== "production") globalForDb.__sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
