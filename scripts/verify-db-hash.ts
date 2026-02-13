import "dotenv/config";
import { getPool } from "~/lib/db.server";
import crypto from "crypto";

async function main() {
    const pool = getPool();

    // 1. Fetch the latest API keys
    console.log("Fetching latest API keys from DB...");
    const res = await pool.query(`
    SELECT id, name, prefix, key_hash, created_at 
    FROM api_keys 
    ORDER BY created_at DESC 
    LIMIT 5
  `);

    if (res.rows.length === 0) {
        console.log("No API keys found.");
        process.exit(0);
    }

    console.log("\n--- Database Records ---");
    res.rows.forEach(row => {
        console.log(`ID: ${row.id}`);
        console.log(`Name: ${row.name}`);
        console.log(`Prefix: ${row.prefix}`);
        console.log(`Key Hash: ${row.key_hash}`);
        console.log(`Created At: ${row.created_at}`);
        console.log("------------------------");
    });

    // 2. Check Secret
    const secret = process.env.BETTER_AUTH_SECRET || "default-secret-do-not-use-in-prod";
    console.log(`\nUsed Secret: ${process.env.BETTER_AUTH_SECRET ? "Loaded from env (HIDDEN)" : "Default Fallback: " + secret}`);

    // 3. Verify the specific key user provided if possible (we can't reverse hash, but we can re-hash to check)
    // key: kimu_277554adbfaa9b48a4cfb525545e01f8ba69f2223cfb5c88
    const testKey = "kimu_277554adbfaa9b48a4cfb525545e01f8ba69f2223cfb5c88";
    const expectedHash = crypto.createHmac("sha256", secret).update(testKey).digest("hex");

    console.log(`\nTest Key: ${testKey}`);
    console.log(`Expected Hash: ${expectedHash}`);

    const match = res.rows.find(row => row.key_hash === expectedHash);
    if (match) {
        console.log("✅ MATCH FOUND! The database contains the hashed version of the test key.");
    } else {
        console.log("⚠️ No match found for the test key in the last 5 records.");
    }
}

main();
