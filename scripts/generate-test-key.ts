import "dotenv/config";
import { generateApiKey } from "~/lib/api-keys.server";
import { getPool } from "~/lib/db.server";

async function main() {
    console.log("Fetching a user...");
    const pool = getPool();
    const userRes = await pool.query(`SELECT id, email FROM "user" LIMIT 1`);
    if (userRes.rows.length === 0) {
        console.error("No users found in DB.");
        process.exit(1);
    }
    const user = userRes.rows[0];
    console.log(`Generating key for user: ${user.email} (${user.id})`);

    const { key, record } = await generateApiKey(user.id, "Test Key CLI");
    console.log("\n✅ API Key Generated:");
    console.log(`Key: ${key}`);
    console.log(`ID: ${record.id}`);
    console.log(`Prefix: ${record.prefix}`);
}

main();
