import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const rawDbUrl = process.env.DATABASE_URL || "";
    let connectionString = rawDbUrl;
    try {
      const u = new URL(rawDbUrl);
      u.search = "";
      connectionString = u.toString();
    } catch (error) {
      if (rawDbUrl) {
        console.error("Invalid DATABASE_URL:", error);
      }
    }

    pool = new Pool({
      connectionString,
    });
  }
  return pool;
}
