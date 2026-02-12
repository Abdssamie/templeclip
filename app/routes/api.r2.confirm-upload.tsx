import { z } from "zod";
import { requireUserId } from "~/lib/auth.utils";
import { Pool } from "pg";
import { ConfirmUploadBodySchema, ConfirmUploadResponseSchema } from "~/schemas/apis/r2";

/**
 * Helper to create JSON error responses
 */
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    const { assetId } = ConfirmUploadBodySchema.parse(body);

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
        [assetId, userId],
      );

      if (result.rows.length === 0) {
        return jsonError("Asset not found or already completed", 404);
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

    const response = ConfirmUploadResponseSchema.parse({
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
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error confirming upload:", error);

    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "Invalid request data", details: error.issues }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return jsonError("Failed to confirm upload", 500);
  }
}
