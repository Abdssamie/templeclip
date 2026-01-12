import { getPresignedDownloadUrl, isR2Configured } from "~/lib/r2-client";
import { auth } from "~/lib/auth.server";
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
 * POST /api/r2/presigned-download
 * 
 * Generate a presigned URL for downloading a file from R2
 * 
 * Request body:
 * {
 *   assetId: string
 * }
 * 
 * Response:
 * {
 *   presignedUrl: string,
 *   expiresIn: number
 * }
 */
export async function action({ request }: { request: Request }) {
    // Check if R2 is configured
    if (!isR2Configured()) {
        return new Response(
            JSON.stringify({ error: "R2 storage is not configured. Please set R2 environment variables." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

    // Authenticate user
    const userId = await requireUserId(request);

    try {
        // Parse request body
        const body = await request.json();
        const { assetId } = body;

        // Validate required fields
        if (!assetId) {
            return new Response(
                JSON.stringify({ error: "Missing required field: assetId" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Create database connection
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

        let asset;
        try {
            // Fetch asset from database and verify ownership
            const result = await pool.query(
                `select r2_key, user_id from assets where id = $1 and deleted_at is null`,
                [assetId]
            );

            if (result.rows.length === 0) {
                return new Response(
                    JSON.stringify({ error: "Asset not found" }),
                    { status: 404, headers: { "Content-Type": "application/json" } }
                );
            }

            asset = result.rows[0];
        } finally {
            await pool.end();
        }

        // Verify user owns the asset
        if (asset.user_id !== userId) {
            return new Response(
                JSON.stringify({ error: "Forbidden" }),
                { status: 403, headers: { "Content-Type": "application/json" } }
            );
        }

        // Check if asset has R2 key
        if (!asset.r2_key) {
            return new Response(
                JSON.stringify({ error: "Asset is not stored in R2" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Generate presigned download URL (15 minutes expiration)
        const presignedUrl = await getPresignedDownloadUrl(asset.r2_key);

        return new Response(
            JSON.stringify({
                presignedUrl,
                expiresIn: 900, // 15 minutes in seconds
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error generating presigned download URL:", error);
        return new Response(
            JSON.stringify({ error: "Failed to generate presigned download URL" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
