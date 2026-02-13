import { requireUserId } from "~/lib/auth.utils";
import { z } from "zod";
import { AssetsResponseSchema, RegisterAssetBodySchema, CloneAssetBodySchema } from "~/schemas";
import { insertAsset, listAssetsByUser, getAssetById, softDeleteAsset } from "~/lib/assets.repo.server";
import path from "path";
import { deleteFromR2, copyInR2, getPresignedDownloadUrl, generateR2Key, R2_BUCKET_NAME } from "~/lib/r2-client";
import { redirect } from "react-router";
import crypto from "crypto";

function inferMediaTypeFromName(name: string, fallback: string = "application/octet-stream"): string {
  const ext = path.extname(name).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".mkv", ".avi"].includes(ext)) return "video/*";
  if ([".mp3", ".wav", ".aac", ".ogg", ".flac"].includes(ext)) return "audio/*";
  if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext)) return "image/*";
  return fallback;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const userId = await requireUserId(request);

  // GET /api/assets[?projectId=...] -> list assets for user
  if (pathname.endsWith("/api/assets") && request.method === "GET") {
    const projectIdParam = new URL(request.url).searchParams.get("projectId");
    const projectId = projectIdParam ? String(projectIdParam) : null;
    const rows = await listAssetsByUser(userId, projectId);
    const items = rows.map((r) => ({
      id: r.id,
      name: r.original_name,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      width: r.width,
      height: r.height,
      duration_seconds: r.duration_seconds,
      durationInSeconds: r.duration_seconds, // camelCase for frontend
      created_at: r.created_at,
      r2_key: r.r2_key,
      mediaUrlRemote: `/api/assets/${r.id}/raw`,
    }));
    // Response validation schema
    const payload = { assets: items };
    const validated = AssetsResponseSchema.parse(payload);
    return new Response(JSON.stringify(validated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/assets/:id/raw -> redirect to R2 signed URL
  const rawMatch = pathname.match(/\/api\/assets\/([^/]+)\/raw$/);
  if (rawMatch && request.method === "GET") {
    const assetId = rawMatch[1];
    const asset = await getAssetById(assetId);
    if (!asset || asset.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (asset.r2_key) {
      try {
        const signedUrl = await getPresignedDownloadUrl(asset.r2_key);
        return redirect(signedUrl);
      } catch (error) {
        console.error("Failed to generate presigned URL:", error);
        return new Response(JSON.stringify({ error: "Failed to retrieve asset URL" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Fallback: If no R2 key, we can't serve it as we removed local storage.
    return new Response(JSON.stringify({ error: "Asset resource is missing or was deleted" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export async function action({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  const userId = await requireUserId(request);

  // POST /api/assets/upload -> Legacy, removed
  if (pathname.endsWith("/api/assets/upload") && method === "POST") {
    return new Response(JSON.stringify({ error: "Use R2 upload instead" }), {
      status: 410, // Gone
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/assets/register -> Legacy, removed
  if (pathname.endsWith("/api/assets/register") && method === "POST") {
    return new Response(JSON.stringify({ error: "Local file registration is deprecated" }), {
      status: 410, // Gone
      headers: { "Content-Type": "application/json" },
    });
  }

  // DELETE /api/assets/:id -> delete
  const delMatch = pathname.match(/\/api\/assets\/([^/]+)$/);
  if (delMatch && method === "DELETE") {
    const assetId = delMatch[1];
    const asset = await getAssetById(assetId);
    if (!asset || asset.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete from R2 if key exists
    if (asset.r2_key) {
      try {
        await deleteFromR2(asset.r2_key);
      } catch (e) {
        console.error("Failed to delete from R2:", e);
        // We continue to delete from DB even if R2 fails (or maybe we should error?)
        // Usually better to ensure DB consistency or soft delete.
      }
    }

    await softDeleteAsset(assetId, userId);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/assets/:id/clone -> clone asset
  const cloneMatch = pathname.match(/\/api\/assets\/([^/]+)\/clone$/);
  if (cloneMatch && method === "POST") {
    const assetId = cloneMatch[1];
    const body = await request.json().catch(() => ({}));
    const suffix = CloneAssetBodySchema.parse(body).suffix;
    const asset = await getAssetById(assetId);

    if (!asset || asset.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!asset.r2_key) {
      return new Response(JSON.stringify({ error: "Source asset not in R2" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const timestamp = Date.now();
    const ext = path.extname(asset.original_name);
    const base = path.basename(asset.original_name, ext);
    // Sanitize suffix to prevent weird characters
    const sanitizedSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, "");
    const newFilename = `${base}_${sanitizedSuffix}_${timestamp}${ext}`;

    const newAssetId = crypto.randomUUID();
    const newR2Key = generateR2Key(userId, newAssetId, newFilename);

    try {
      await copyInR2(asset.r2_key, newR2Key);
    } catch (e) {
      console.error("R2 Copy Failed", e);
      return new Response(JSON.stringify({ error: "Failed to copy asset in storage" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const record = await insertAsset({
      id: newAssetId,
      userId,
      projectId: asset.project_id ?? null,
      originalName: `${asset.original_name} ${suffix}`.trim(),
      // storage_key column removed - R2 storage uses r2_key instead
      mimeType: asset.mime_type,
      sizeBytes: asset.size_bytes,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.duration_seconds,
      r2Key: newR2Key,
      r2Bucket: R2_BUCKET_NAME,
    });

    return new Response(
      JSON.stringify({
        success: true,
        asset: {
          id: record.id,
          name: record.original_name,
          mediaUrlRemote: `/api/assets/${record.id}/raw`,
          width: record.width,
          height: record.height,
          durationInSeconds: record.duration_seconds,
          size: record.size_bytes,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response("Not Found", { status: 404 });
}
