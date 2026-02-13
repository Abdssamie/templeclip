import crypto from "crypto";
import { getPool } from "~/lib/db.server";

export type AssetRecord = {
  id: string;
  user_id: string;
  project_id: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  created_at: string;
  deleted_at: string | null;
  r2_bucket: string | null;
  r2_key: string | null;
  upload_status: string | null;
};

// Schema creation is handled by SQL migrations in /migrations.

export async function insertAsset(params: {
  id?: string;
  userId: string;
  projectId?: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  r2Key?: string | null;
  r2Bucket?: string | null;
}): Promise<AssetRecord> {
  const client = await getPool().connect();
  try {
    const id = params.id || crypto.randomUUID();
    const { rows } = await client.query<AssetRecord>(
      `insert into assets (id, user_id, project_id, original_name, mime_type, size_bytes, width, height, duration_seconds, r2_key, r2_bucket)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning *`,
      [
        id,
        params.userId,
        params.projectId ?? null,
        params.originalName,
        params.mimeType,
        params.sizeBytes,
        params.width ?? null,
        params.height ?? null,
        params.durationSeconds ?? null,
        params.r2Key ?? null,
        params.r2Bucket ?? null,
      ],
    );
    return rows[0];
  } finally {
    client.release();
  }
}

export async function listAssetsByUser(userId: string, projectId: string | null): Promise<AssetRecord[]> {
  const client = await getPool().connect();
  try {
    const query =
      projectId === null
        ? `select * from assets where user_id = $1 and project_id is null and deleted_at is null and upload_status = 'completed' order by created_at desc`
        : `select * from assets where user_id = $1 and project_id = $2 and deleted_at is null and upload_status = 'completed' order by created_at desc`;
    const params = projectId === null ? [userId] : [userId, projectId];
    const { rows } = await client.query<AssetRecord>(query, params);
    return rows;
  } finally {
    client.release();
  }
}

export async function getAssetById(id: string): Promise<AssetRecord | null> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<AssetRecord>(`select * from assets where id = $1 and deleted_at is null`, [id]);
    return rows[0] ?? null;
  } finally {
    client.release();
  }
}

export async function softDeleteAsset(id: string, userId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`update assets set deleted_at = now() where id = $1 and user_id = $2 and deleted_at is null`, [
      id,
      userId,
    ]);
  } finally {
    client.release();
  }
}

/**
 * Hard delete an asset record (used for cleanup of failed uploads)
 */
export async function deleteAssetRecord(id: string, userId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`delete from assets where id = $1 and user_id = $2`, [id, userId]);
  } finally {
    client.release();
  }
}
