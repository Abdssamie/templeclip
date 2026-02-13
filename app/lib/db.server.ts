import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const rawDbUrl = process.env.DATABASE_URL;

    console.log("🔍 [db.server.ts] Creating database pool");
    console.log("🔍 DATABASE_URL exists:", !!rawDbUrl);
    console.log("🔍 DATABASE_URL type:", typeof rawDbUrl);
    console.log("🔍 DATABASE_URL length:", rawDbUrl?.length || 0);

    if (!rawDbUrl) {
      console.error("❌ DATABASE_URL is not set in environment variables");
      console.error(
        "❌ Available env vars:",
        Object.keys(process.env).filter((k) => k.includes("DATABASE") || k.includes("POSTGRES")),
      );
      throw new Error("DATABASE_URL environment variable is required");
    }

    let connectionString = rawDbUrl;
    try {
      const u = new URL(rawDbUrl);
      u.search = "";
      connectionString = u.toString();
      console.log("✅ Successfully parsed DATABASE_URL");
    } catch (error) {
      console.error("❌ Failed to parse DATABASE_URL:", error);
      console.error("❌ Raw value:", rawDbUrl.substring(0, 30) + "...");
      throw new Error("Invalid DATABASE_URL format");
    }

    pool = new Pool({
      connectionString,
    });

    console.log("✅ Database pool created successfully");
  }
  return pool;
}
