import crypto from "crypto";
import { getPool } from "~/lib/db.server";
import type { MediaBinItem, Scene, TimelineState } from "~/components/timeline/types";

export type ProjectRecord = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  scenes: Scene[];
  timeline: TimelineState | null;
  text_bin_items: MediaBinItem[];
  canvas_settings: object | null;
  last_opened_at: string | null;
  thumbnail_asset_id: string | null;
};

export async function createProject(params: { userId: string; name: string }): Promise<ProjectRecord> {
  const client = await getPool().connect();
  try {
    const id = crypto.randomUUID();
    const { rows } = await client.query<ProjectRecord>(
      `insert into projects (id, user_id, name) values ($1,$2,$3) returning *`,
      [id, params.userId, params.name],
    );
    return rows[0];
  } finally {
    client.release();
  }
}

export async function listProjectsByUser(userId: string): Promise<ProjectRecord[]> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<ProjectRecord>(
      `select * from projects where user_id = $1 order by created_at desc`,
      [userId],
    );
    return rows;
  } finally {
    client.release();
  }
}

export async function getProjectById(id: string): Promise<ProjectRecord | null> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<ProjectRecord>(`select * from projects where id = $1`, [id]);

    return rows[0] ?? null;
  } finally {
    client.release();
  }
}

export async function deleteProjectById(id: string, userId: string): Promise<boolean> {
  const client = await getPool().connect();
  try {
    const { rowCount } = await client.query(`delete from projects where id = $1 and user_id = $2`, [id, userId]);
    return (rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function getProjectScenes(id: string): Promise<Scene[]> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ scenes: Scene[] }>(`select scenes from projects where id = $1`, [id]);
    return rows[0]?.scenes ?? [];
  } finally {
    client.release();
  }
}

export async function getProjectSceneById(projectId: string, sceneId: string): Promise<Scene | null> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ scenes: Scene[] }>(`select scenes from projects where id = $1`, [projectId]);
    const scenes = rows[0]?.scenes ?? [];
    return scenes.find((s) => s.id === sceneId) ?? null;
  } finally {
    client.release();
  }
}

export async function updateProjectState(
  projectId: string,
  userId: string,
  state: { timeline?: TimelineState | null; textBinItems?: MediaBinItem[] },
): Promise<boolean> {
  const client = await getPool().connect();
  try {
    // Build dynamic query to only update provided fields
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (state.timeline !== undefined) {
      updates.push(`timeline = $${paramIndex++}`);
      values.push(JSON.stringify(state.timeline));
    }

    if (state.textBinItems !== undefined) {
      updates.push(`text_bin_items = $${paramIndex++}`);
      values.push(JSON.stringify(state.textBinItems));
    }

    if (updates.length === 0) {
      return false; // Nothing to update
    }

    updates.push(`updated_at = now()`);
    values.push(projectId, userId);

    const query = `update projects set ${updates.join(", ")} where id = $${paramIndex++} and user_id = $${paramIndex++}`;
    const { rowCount } = await client.query(query, values);
    return (rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function updateProjectScenes(id: string, userId: string, scenes: Scene[]): Promise<boolean> {
  const client = await getPool().connect();
  try {
    const { rowCount } = await client.query(
      `update projects set scenes = $1, updated_at = now() where id = $2 and user_id = $3`,
      [JSON.stringify(scenes), id, userId],
    );
    return (rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
