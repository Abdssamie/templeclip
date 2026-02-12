import { z } from "zod";
import { getPresignedDownloadUrl, isR2Configured } from "~/lib/r2-client";
import { requireUserId } from "~/lib/auth.utils";
import { Pool } from "pg";
import { PresignedDownloadQuerySchema, PresignedDownloadResponseSchema } from "~/schemas/apis/r2";

/**
 * Helper to create JSON error responses
 */
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRequest(request: Request, rawAssetId: string | null) {
  // Check if R2 is configured
  if (!isR2Configured()) {
    return jsonError("R2 storage is not configured. Please set R2 environment variables.", 500);
  }

  // Authenticate user
  const userId = await requireUserId(request);

  try {
    // Validate with Zod
    const { assetId } = PresignedDownloadQuerySchema.parse({
      assetId: rawAssetId,
    });

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
      const result = await pool.query(`select r2_key, user_id from assets where id = $1 and deleted_at is null`, [
        assetId,
      ]);

      if (result.rows.length === 0) {
        return jsonError("Asset not found", 404);
      }

      asset = result.rows[0];
    } finally {
      await pool.end();
    }

    // Verify user owns the asset
    if (asset.user_id !== userId) {
      return jsonError("Forbidden", 403);
    }

    // Check if asset has R2 key
    if (!asset.r2_key) {
      return jsonError("Asset is not stored in R2", 400);
    }

    // Generate presigned download URL (15 minutes expiration)
    const presignedUrl = await getPresignedDownloadUrl(asset.r2_key);

    const response = PresignedDownloadResponseSchema.parse({
      presignedUrl,
      expiresIn: 900,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating presigned download URL:", error);

    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "Invalid request data", details: error.issues }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return jsonError("Failed to generate presigned download URL", 500);
  }
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const assetId = url.searchParams.get("assetId");
  return handleRequest(request, assetId);
}

export async function action({ request }: { request: Request }) {
  const body = await request.json().catch(() => ({}));
  const { assetId } = body;
  return handleRequest(request, assetId);
}
