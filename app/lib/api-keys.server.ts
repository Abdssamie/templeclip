import { getPool } from "./db.server";
import crypto from "crypto";

// Use BETTER_AUTH_SECRET or fallback for HMAC
let SECRET: string | undefined;
if (process.env.NODE_ENV == "development") {
    SECRET = process.env.API_KEY_SECRET || "default-secret-do-not-use-in-prod";
} else {
    SECRET = process.env.API_KEY_SECRET;
}

/**
 * Generates a new API key for a user.
 * Returns the raw key (to show ONCE) and the database record.
 */
export async function generateApiKey(userId: string, name: string) {
    const client = await getPool().connect();
    try {
        // Generate a random key: prefix + random hex
        const prefix = "kimu";
        const randomPart = crypto.randomBytes(24).toString("hex");
        const key = `${prefix}_${randomPart}`;

        if (SECRET === undefined) {
        throw new Error("BETTER_AUTH_SECRET is not defined");
        }

        // Hash the key for storage using HMAC
        const keyHash = crypto.createHmac("sha256", SECRET).update(key).digest("hex");

        // Store in DB
        const result = await client.query(
            `INSERT INTO api_keys (user_id, name, key_hash, prefix)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, prefix, created_at, last_used_at`,
            [userId, name, keyHash, prefix]
        );

        return {
            key, // Show this to user ONLY once
            record: result.rows[0],
        };
    } finally {
        client.release();
    }
}

/**
 * Lists all API keys for a user (without the full key).
 */
export async function listApiKeys(userId: string) {
    const client = await getPool().connect();
    try {
        const result = await client.query(
            `SELECT id, name, prefix, created_at, last_used_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows;
    } finally {
        client.release();
    }
}

/**
 * Revokes (deletes) an API key.
 */
export async function revokeApiKey(userId: string, keyId: string) {
    const client = await getPool().connect();
    try {
        await client.query(`DELETE FROM api_keys WHERE id = $1 AND user_id = $2`, [
            keyId,
            userId,
        ]);
    } finally {
        client.release();
    }
}

/**
 * Verifies an API key and returns the user ID if valid.
 * Also updates last_used_at.
 */
export async function verifyApiKey(key: string): Promise<string | null> {
    const client = await getPool().connect();
    try {
        // 1. Basic format check
        if (!key.includes("_")) return null;

        if (SECRET === undefined) {
        throw new Error("BETTER_AUTH_SECRET is not defined");
        }

        // 2. Hash the incoming key using HMAC
        const keyHash = crypto.createHmac("sha256", SECRET).update(key).digest("hex");

        // 3. Find in DB
        const result = await client.query(
            `SELECT user_id FROM api_keys WHERE key_hash = $1`,
            [keyHash]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const userId = result.rows[0].user_id;

        // 4. Async update last_used_at (don't await to not block)
        // catch error to avoid unhandled rejection
        getPool()
            .query(`UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1`, [
                keyHash,
            ])
            .catch((err: unknown) =>
                console.error("Failed to update api key usage", err)
            );

        return userId;
    } finally {
        client.release();
    }
}
