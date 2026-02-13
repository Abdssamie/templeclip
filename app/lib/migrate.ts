import { Pool } from "pg";
import fs from "fs";
import path from "path";

async function run() {
  const rawDbUrl = process.env.DATABASE_URL;

  if (!rawDbUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exitCode = 1;
    return;
  }

  let connectionString = rawDbUrl;
  try {
    const u = new URL(rawDbUrl);
    u.search = "";
    connectionString = u.toString();
  } catch (error) {
    console.error("❌ Invalid database URL:", error);
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({
    connectionString,
  });
  const client = await pool.connect();
  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of already applied migrations
    const appliedResult = await client.query("SELECT name FROM _migrations ORDER BY name");
    const appliedMigrations = new Set(appliedResult.rows.map((row) => row.name));

    // Get all migration files
    const dir = path.resolve("migrations");
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`📊 Found ${files.length} migration files`);
    console.log(`✅ Already applied: ${appliedMigrations.size} migrations`);

    let appliedCount = 0;
    for (const file of files) {
      if (appliedMigrations.has(file)) {
        console.log(`⏭️  Skipping ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      console.log(`🔄 Running migration: ${file}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`✅ Applied ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`❌ Failed to apply ${file}:`, err);
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log("✨ No new migrations to apply");
    } else {
      console.log(`✅ Successfully applied ${appliedCount} new migration(s)`);
    }
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
