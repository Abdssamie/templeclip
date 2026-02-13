import { z } from "zod";
import { getPresignedUploadUrl, generateR2Key, isR2Configured, R2_BUCKET_NAME } from "~/lib/r2-client";
import { requireUserId } from "~/lib/auth.utils";
import { generateUUID } from "~/utils/uuid";
import { Pool } from "pg";
import { PresignedUploadBodySchema, PresignedUploadResponseSchema } from "~/schemas/apis/r2";

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
 * POST /api/r2/presigned-upload
 *
 * Generate a presigned URL for uploading a file directly to R2
 */
export async function action({ request }: { request: Request }) {
  if (!isR2Configured()) {
    return jsonError("R2 storage is not configured. Please set R2 environment variables.", 500);
  }

  const userId = await requireUserId(request);

  try {
    const body = await request.json();
    const { filename, mimeType, sizeBytes, width, height, durationSeconds, projectId } =
      PresignedUploadBodySchema.parse(body);

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
          width ?? null,
          height ?? null,
          durationSeconds ?? null,
          projectId ?? null,
          R2_BUCKET_NAME,
          r2Key,
          "pending",
        ],
      );
    } finally {
      await pool.end();
    }

    const presignedUrl = await getPresignedUploadUrl(userId, assetId, filename, mimeType);

    const response = PresignedUploadResponseSchema.parse({
      presignedUrl,
      assetId,
      r2Key,
      expiresIn: 900,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating presigned upload URL:", error);

    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "Invalid request data", details: error.issues }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return jsonError("Failed to generate presigned upload URL", 500);
  }
}
