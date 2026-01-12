import { getPresignedUploadUrl, generateR2Key, isR2Configured, R2_BUCKET_NAME } from "~/lib/r2-client";
import { auth } from "~/lib/auth.server";
import { generateUUID } from "~/utils/uuid";
import { Pool } from "pg";

async function requireUserId(request: Request): Promise<string> {
    try {
        const session = await auth.api?.getSession?.({ headers: request.headers });
        const uid: string | undefined = session?.user?.id || session?.session?.userId;
        if (uid) return String(uid);
    } catch {
        console.error("Failed to get session");
    }
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:5173";
    const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/api/auth/session`, {
        headers: { Cookie: request.headers.get("cookie") || "" },
    });
    if (!res.ok) throw new Response("Unauthorized", { status: 401 });
    const json = await res.json().catch(() => ({}));
    const uid2: string | undefined = json?.user?.id || json?.userId || json?.session?.userId || json?.data?.user?.id;
    if (!uid2) throw new Response("Unauthorized", { status: 401 });
    return String(uid2);
}

/**
 * POST /api/r2/presigned-upload
 * 
 * Generate a presigned URL for uploading a file directly to R2
 */
export async function action({ request }: { request: Request }) {
    if (!isR2Configured()) {
        return new Response(
            JSON.stringify({ error: "R2 storage is not configured. Please set R2 environment variables." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

    const userId = await requireUserId(request);

    try {
        const body = await request.json();
        const { filename, mimeType, sizeBytes, width, height, durationSeconds, projectId } = body;

        if (!filename || !mimeType || !sizeBytes) {
            return new Response(
                JSON.stringify({ error: "Missing required fields: filename, mimeType, sizeBytes" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const assetId = generateUUID();
        const r2Key = generateR2Key(userId, assetId, filename);

        const rawDbUrl = process.env.DATABASE_URL || "";
        let connectionString = rawDbUrl;
        try {
            const u = new URL(rawDbUrl);
            u.search = "";
            connectionString = u.toString();
        } catch {
            console.error("Invalid database URL");
        }
        const pool = new Pool({ connectionString });

        try {
            await pool.query(
                `insert into assets (
          id, user_id, original_name, storage_key, mime_type, size_bytes,
          width, height, duration_seconds, project_id,
          r2_bucket, r2_key, upload_status, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())`,
                [
                    assetId,
                    userId,
                    filename,
                    null,
                    mimeType,
                    sizeBytes,
                    width || null,
                    height || null,
                    durationSeconds || null,
                    projectId || null,
                    R2_BUCKET_NAME,
                    r2Key,
                    "pending",
                ]
            );
        } finally {
            await pool.end();
        }

        const presignedUrl = await getPresignedUploadUrl(userId, assetId, filename);

        return new Response(
            JSON.stringify({
                presignedUrl,
                assetId,
                r2Key,
                expiresIn: 900,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error generating presigned upload URL:", error);
        return new Response(
            JSON.stringify({ error: "Failed to generate presigned upload URL" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
