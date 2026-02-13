import fs from "fs";
import { Pool } from "pg";
import path from "path";
import type { MediaBinItem, Scene, TimelineState } from "~/components/timeline/types";
import { listAssetsByUser, softDeleteAsset } from "~/lib/assets.repo.server";
import { requireUserId } from "~/lib/auth.utils";
import {
  createProject,
  deleteProjectById,
  getProjectById,
  getProjectScenes,
  listProjectsByUser,
  updateProjectScenes,
} from "~/lib/projects.repo";
import { loadProjectState, saveProjectState } from "~/lib/timeline.store";
import {
  CreateProjectBodySchema,
  PatchProjectBodySchema,
  ProjectsResponseSchema,
  ProjectStateResponseSchema,
} from "~/schemas";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const userId = await requireUserId(request);

  // GET /api/projects -> list
  if (pathname.endsWith("/api/projects") && request.method === "GET") {
    const rows = await listProjectsByUser(userId);
    const payload = ProjectsResponseSchema.parse({ projects: rows });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/projects/:id -> get (owner only)
  const m = pathname.match(/\/api\/projects\/([^/]+)$/);
  if (m && request.method === "GET") {
    const id = m[1];
    const proj = await getProjectById(id);
    if (!proj || proj.user_id !== userId) return new Response("Not Found", { status: 404 });
    const state = await loadProjectState(id);
    const scenes: Scene[] = await getProjectScenes(id);
    const payload = ProjectStateResponseSchema.parse({
      project: proj,
      timeline: state.timeline,
      textBinItems: state.textBinItems,
      scenes: scenes,
    });
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // DELETE /api/projects/:id -> delete project and assets
  if (m && request.method === "DELETE") {
    const id = m[1];
    const proj = await getProjectById(id);
    if (!proj || proj.user_id !== userId) return new Response("Not Found", { status: 404 });

    // Delete assets belonging to this project
    try {
      const assets = await listAssetsByUser(userId, id);
      await Promise.all(
        assets.map(async (a) => {
          // Remove file from out/
          try {
            // Validate storage_key to prevent path traversal
            if (!a.storage_key || typeof a.storage_key !== "string") {
              console.error("Invalid storage key");
              return;
            }
            // Sanitize the storage key to prevent path traversal
            const sanitizedKey = path.basename(a.storage_key);
            const filePath = path.resolve("out", sanitizedKey);
            if (filePath.startsWith(path.resolve("out"))) {
              try {
                await fs.promises.unlink(filePath);
              } catch (e) {
                if ((e as { code?: string }).code !== "ENOENT") {
                  console.error("Failed to delete asset", e);
                }
              }
            }
          } catch {
            console.error("Failed to delete asset");
          }
          await softDeleteAsset(a.id, userId);
        }),
      );
    } catch {
      console.error("Failed to delete assets");
    }

    const ok = await deleteProjectById(id, userId);
    if (!ok) return new Response("Not Found", { status: 404 });
    // remove timeline file if exists
    try {
      await fs.promises.unlink(path.resolve(process.env.TIMELINE_DIR || "project_data", `${id}.json`));
    } catch {
      console.error("Failed to delete timeline file");
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export async function action({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const userId = await requireUserId(request);

  // POST /api/projects -> create
  if (pathname.endsWith("/api/projects") && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const parsed = CreateProjectBodySchema.safeParse(body);
    const name: string = parsed.success ? parsed.data.name : "Untitled Project";
    const proj = await createProject({ userId, name });
    return new Response(JSON.stringify({ project: proj }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  // DELETE /api/projects/:id
  const delMatch = pathname.match(/\/api\/projects\/([^/]+)$/);
  if (delMatch && request.method === "DELETE") {
    const id = delMatch[1];
    const proj = await getProjectById(id);
    if (!proj || proj.user_id !== userId) return new Response("Not Found", { status: 404 });
    // cascade delete assets (files + soft delete rows)
    try {
      const assets = await listAssetsByUser(userId, id);
      await Promise.all(
        assets.map(async (a) => {
          try {
            if (!a.storage_key || typeof a.storage_key !== "string") {
              console.error("Invalid storage key");
              return;
            }
            const sanitizedKey = path.basename(a.storage_key);
            const filePath = path.resolve("out", sanitizedKey);
            if (filePath.startsWith(path.resolve("out"))) {
              try {
                await fs.promises.unlink(filePath);
              } catch (e) {
                if ((e as { code?: string }).code !== "ENOENT") {
                  console.error("Failed to delete asset", e);
                }
              }
            }
          } catch {
            console.error("Failed to delete asset");
          }
          await softDeleteAsset(a.id, userId);
        }),
      );
    } catch {
      console.error("Failed to delete assets");
    }
    const ok = await deleteProjectById(id, userId);
    if (!ok) return new Response("Not Found", { status: 404 });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // PATCH /api/projects/:id -> rename
  const patchMatch = pathname.match(/\/api\/projects\/([^/]+)$/);
  if (patchMatch && request.method === "PATCH") {
    const id = patchMatch[1];
    const proj = await getProjectById(id);
    if (!proj || proj.user_id !== userId) return new Response("Not Found", { status: 404 });
    const body = await request.json().catch(() => ({}));
    const parsed = PatchProjectBodySchema.safeParse(body);
    const name: string | undefined = parsed.success ? parsed.data.name : undefined;
    const timeline: TimelineState | undefined = parsed.success ? parsed.data.timeline : undefined;
    const textBinItems: MediaBinItem[] | undefined = parsed.success ? parsed.data.textBinItems : undefined;
    const scenes: Scene[] | undefined = parsed.success ? parsed.data.scenes : undefined;
    if (!name && !timeline && !textBinItems && !scenes)
      return new Response(JSON.stringify({ error: "No changes" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });

    const rawDbUrl = process.env.DATABASE_URL || "";
    let connectionString = rawDbUrl;
    try {
      const u = new URL(rawDbUrl);
      u.search = "";
      connectionString = u.toString();
    } catch {
      console.error("Invalid database URL");
    }
    const pool = new Pool({
      connectionString,
    });
    try {
      if (name) {
        await pool.query(`update projects set name = $1, updated_at = now() where id = $2 and user_id = $3`, [
          name,
          id,
          userId,
        ]);
      }
    } finally {
      await pool.end();
    }
    if (timeline || textBinItems) {
      const prev = await loadProjectState(id);
      await saveProjectState(id, {
        timeline: timeline ?? prev.timeline,
        textBinItems: textBinItems ?? prev.textBinItems,
      });
    }
    if (scenes) {
      await updateProjectScenes(id, userId, scenes);
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}
