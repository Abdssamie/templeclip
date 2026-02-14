import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { createRenderAdapter } from "~/services/render-adapter.factory";
import type { RenderInput } from "~/services/render-adapter.interface";
import { getProjectScenes } from "~/lib/projects.repo";
import { applyElasticityToTimeline } from "~/utils/elasticity";
import { buildTimelineFromScenes, type SceneRenderRequest } from "~/utils/timeline-builder.server";
import { resolveR2UrlsInTimeline } from "~/utils/resolve-r2-urls.server";
import { verifyApiKey } from "~/lib/api-keys.server";

// Helper to authenticate via API Key ONLY
async function authenticate(request: Request): Promise<string> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer kimu_") || request.headers.get("X-API-KEY")) {
    const key = authHeader?.replace("Bearer ", "") || request.headers.get("X-API-KEY") || "";
    const verifiedUserId = await verifyApiKey(key);
    if (verifiedUserId) return verifiedUserId;
  }
  throw new Response("Unauthorized: Invalid API Key", { status: 401 });
}

/**
 * POST /api/v1/render
 * Start a render job using API Key
 */
export async function action({ request }: ActionFunctionArgs) {
  let userId: string;
  try {
    userId = await authenticate(request);
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate request body
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const adapter = createRenderAdapter();

    // Support both Scene-based and Legacy Timeline-based
    if (!body.projectId || !body.scenes) {
      return Response.json({ error: "Invalid request: Missing projectId/scenes" }, { status: 400 });
    }

    // Scene-based render request
    if (typeof body.projectId !== "string") return Response.json({ error: "Missing projectId" }, { status: 400 });
    if (!Array.isArray(body.scenes) || body.scenes.length === 0)
      return Response.json({ error: "Missing scenes" }, { status: 400 });

    const projectId = body.projectId;
    const sceneRequests: SceneRenderRequest[] = body.scenes;
    const compositionWidth = body.compositionWidth || 1920;
    const compositionHeight = body.compositionHeight || 1080;
    const applyElasticity = body.applyElasticity !== false;

    console.log(`[Render] Scene-based request: projectId=${projectId}, sceneRequests=${sceneRequests.length}`);
    const projectScenes = await getProjectScenes(projectId);
    console.log(`[Render] Fetched ${projectScenes.length} project scenes for projectId: ${projectId}`);

    const { timelineData, totalDuration } = buildTimelineFromScenes(sceneRequests, projectScenes);

    if (applyElasticity && projectScenes.length > 0) {
      applyElasticityToTimeline(timelineData, projectScenes);
    }

    console.log(`[Render] Resolving R2 URLs with ${projectScenes.length} project scenes context`);
    const resolvedTimelineData = await resolveR2UrlsInTimeline(userId, timelineData, projectScenes, 86400);

    // Merge all variables from scene requests
    const mergedVariables: Record<string, string> = {};
    for (const sceneRequest of sceneRequests) {
      Object.assign(mergedVariables, sceneRequest.variables);
    }

    const renderInput: RenderInput = {
      userId,
      timelineData: resolvedTimelineData,
      compositionWidth: compositionWidth,
      compositionHeight: compositionHeight,
      durationInFrames: body.durationInFrames || Math.ceil(totalDuration * 30),
      scenes: projectScenes,
      variableValues: mergedVariables,
    };

    console.log(`[Render] Starting render with input: duration=${body.durationInFrames || totalDuration * 30}`);
    const result = await adapter.startRender(renderInput);

    return Response.json({ renderId: result.renderId, bucketName: result.bucketName });
  } catch (error) {
    console.error("Error starting render:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to start render";
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * GET /api/v1/render
 * Poll render progress using API Key
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    await authenticate(request);
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const renderId = url.searchParams.get("renderId");
    const bucketName = url.searchParams.get("bucketName");

    if (!renderId || !bucketName) {
      return Response.json({ error: "Missing renderId or bucketName" }, { status: 400 });
    }

    const adapter = createRenderAdapter();
    const progress = await adapter.pollRenderProgress(renderId, bucketName);
    return Response.json(progress);
  } catch (error) {
    console.error("Error polling render progress:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to get render progress";
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
