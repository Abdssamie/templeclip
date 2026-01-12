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
 * POST /api/r2/confirm-upload
 * 
 * Confirm that a file upload to R2 has completed successfully
 */
export async function action({ request }: { request: Request }) {
    const userId = await requireUserId(request);

    try {
        const body = await request.json();
        const { assetId } = body;

        if (!assetId) {
            return new Response(
                JSON.stringify({ error: "Missing required field: assetId" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

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
            const result = await pool.query(
                `update assets 
         set upload_status = 'completed'
         where id = $1 and user_id = $2 and upload_status = 'pending'
         returning id, original_name, mime_type, size_bytes, r2_key, width, height, duration_seconds`,
                [assetId, userId]
            );

            if (result.rows.length === 0) {
                return new Response(
                    JSON.stringify({ error: "Asset not found or already completed" }),
                    { status: 404, headers: { "Content-Type": "application/json" } }
                );
            }

            asset = result.rows[0];

            try {
                await pool.query(`refresh materialized view concurrently user_storage`);
            } catch (error) {
                console.warn("Failed to refresh user_storage view:", error);
            }
        } finally {
            await pool.end();
        }

        return new Response(
            JSON.stringify({
                success: true,
                asset: {
                    id: asset.id,
                    originalName: asset.original_name,
                    mimeType: asset.mime_type,
                    sizeBytes: parseInt(asset.size_bytes),
                    r2Key: asset.r2_key,
                    width: asset.width,
                    height: asset.height,
                    durationSeconds: asset.duration_seconds,
                },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error confirming upload:", error);
        return new Response(
            JSON.stringify({ error: "Failed to confirm upload" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
