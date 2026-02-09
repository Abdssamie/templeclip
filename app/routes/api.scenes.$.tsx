import type { Scene } from "~/components/timeline/types";
import { auth } from "~/lib/auth.server";
import { getProjectById, getProjectScenes } from "~/lib/projects.repo";
import { ExportSceneResponseSchema, ListScenesResponseSchema } from "~/schemas/apis/scenes";

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

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const userId = await requireUserId(request);

  // GET /api/scenes/:projectId -> list all scenes in project
  const listMatch = pathname.match(/\/api\/scenes\/([^/]+)$/);
  if (listMatch && request.method === "GET") {
    const projectId = listMatch[1];
    const proj = await getProjectById(projectId);
    if (!proj || proj.user_id !== userId) {
      return new Response("Not Found", { status: 404 });
    }

    const scenes = await getProjectScenes(projectId);
    const payload = ListScenesResponseSchema.parse({ scenes });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/scenes/:projectId/:sceneId -> export single scene
  const exportMatch = pathname.match(/\/api\/scenes\/([^/]+)\/([^/]+)$/);
  if (exportMatch && request.method === "GET") {
    const projectId = exportMatch[1];
    const sceneId = exportMatch[2];

    const proj = await getProjectById(projectId);
    if (!proj || proj.user_id !== userId) {
      return new Response("Not Found", { status: 404 });
    }

    const scenes = await getProjectScenes(projectId);
    const scene = scenes.find((s: Scene) => s.id === sceneId);

    if (!scene) {
      return new Response("Scene not found", { status: 404 });
    }

    const payload = ExportSceneResponseSchema.parse({ scene });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}
