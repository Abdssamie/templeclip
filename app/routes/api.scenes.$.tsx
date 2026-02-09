import { z } from "zod";
import { requireUserId } from "~/lib/auth.utils";
import { getProjectById, getProjectScenes, getProjectSceneById } from "~/lib/projects.repo";
import { ExportSceneResponseSchema, ListScenesResponseSchema } from "~/schemas/apis/scenes";

/**
 * Helper to create JSON error responses
 */
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function loader({ request }: { request: Request }): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const userId = await requireUserId(request);

    // GET /api/scenes/:projectId -> list all scenes in project
    const listMatch = pathname.match(/\/api\/scenes\/([^/]+)$/);
    if (listMatch && request.method === "GET") {
      const projectId = listMatch[1];

      const proj = await getProjectById(projectId);
      if (!proj || proj.user_id !== userId) {
        return jsonError("Not Found", 404);
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
        return jsonError("Not Found", 404);
      }

      const scene = await getProjectSceneById(projectId, sceneId);

      if (!scene) {
        return jsonError("Scene not found", 404);
      }

      const payload = ExportSceneResponseSchema.parse({ scene });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return jsonError("Not Found", 404);
  } catch (error) {
    console.error("Scene API error:", error);

    // Handle known error types
    if (error instanceof Response) throw error;

    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "Invalid data", details: error.issues }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generic error
    return jsonError("Internal server error", 500);
  }
}
