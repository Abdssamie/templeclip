import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireUserId } from "~/lib/auth.utils";
import { startLambdaRender, pollRenderProgress, type RenderInput } from "~/services/lambda-render.server";
import { getProjectScenes } from "~/lib/projects.repo";
import { applyElasticityToTimeline } from "~/utils/elasticity";
import { buildTimelineFromScenes, type SceneRenderRequest } from "~/utils/timeline-builder.server";
import { resolveR2UrlsInTimeline } from "~/utils/resolve-r2-urls.server";

/**
 * POST /api/render
 * Start a Lambda render job
 *
 * Request body (scene-based):
 * {
 *   projectId: string,
 *   scenes: [{ sceneId: string, variables: Record<string, string>, duration?: number }],
 *   compositionWidth?: number,
 *   compositionHeight?: number,
 *   applyElasticity?: boolean
 * }
 *
 * OR (legacy timeline-based):
 * {
 *   timelineData: TimelineDataItem[],
 *   compositionWidth: number,
 *   compositionHeight: number,
 *   durationInFrames: number
 * }
 *
 * Response:
 * {
 *   renderId: string,
 *   bucketName: string
 * }
 */
export async function action({ request }: ActionFunctionArgs) {
  // Require authentication
  const userId = await requireUserId(request);

  try {
    const body = await request.json();

    // Validate request body has required fields
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Check if this is a scene-based request or legacy timeline-based request
    if (body.projectId && body.scenes) {
      // Scene-based render request
      if (typeof body.projectId !== "string") {
        return Response.json({ error: "Missing required field: projectId" }, { status: 400 });
      }

      if (!Array.isArray(body.scenes) || body.scenes.length === 0) {
        return Response.json({ error: "Missing or empty required field: scenes" }, { status: 400 });
      }

      const projectId = body.projectId;
      const sceneRequests: SceneRenderRequest[] = body.scenes;
      const compositionWidth = body.compositionWidth || 1920;
      const compositionHeight = body.compositionHeight || 1080;
      const applyElasticity = body.applyElasticity !== false;

      // Fetch all project scenes from database
      const projectScenes = await getProjectScenes(projectId);

      // Build timeline from scene requests
      const { timelineData, totalDuration } = buildTimelineFromScenes(sceneRequests, projectScenes);

      // Apply elasticity rules if enabled
      // TODO: Investigate elasticity timing - rules reference original scene scrubber IDs
      // which may not match after expansion. The elasticity utility handles overlap prevention.
      if (applyElasticity && projectScenes.length > 0) {
        console.log("Applying elasticity rules to timeline...");
        applyElasticityToTimeline(timelineData, projectScenes);
      }

      // Resolve R2 URLs for Lambda access (24 hours expiration for long renders)
      console.log("Resolving R2 URLs for Lambda rendering...");
      const resolvedTimelineData = await resolveR2UrlsInTimeline(
        userId,
        timelineData,
        projectScenes,
        86400 // 24 hours
      );

      // Calculate final duration in frames (FPS = 30)
      const finalDurationInFrames = Math.ceil(totalDuration * 30);

      // Merge all variables from scene requests
      const mergedVariables: Record<string, string> = {};
      for (const sceneRequest of sceneRequests) {
        Object.assign(mergedVariables, sceneRequest.variables);
      }

      // Start Lambda render
      const result = await startLambdaRender({
        timelineData: resolvedTimelineData,
        compositionWidth,
        compositionHeight,
        durationInFrames: finalDurationInFrames,
        scenes: projectScenes,
        variableValues: mergedVariables,
      });

      return Response.json({
        renderId: result.renderId,
        bucketName: result.bucketName,
      });

    } else {
      // Legacy timeline-based render request
      if (!Array.isArray(body.timelineData)) {
        return Response.json({ error: "Missing or invalid required field: timelineData" }, { status: 400 });
      }

      if (typeof body.compositionWidth !== "number") {
        return Response.json({ error: "Missing or invalid required field: compositionWidth" }, { status: 400 });
      }

      if (typeof body.compositionHeight !== "number") {
        return Response.json({ error: "Missing or invalid required field: compositionHeight" }, { status: 400 });
      }

      if (typeof body.durationInFrames !== "number") {
        return Response.json({ error: "Missing or invalid required field: durationInFrames" }, { status: 400 });
      }

      // Resolve R2 URLs for Lambda access
      console.log("Resolving R2 URLs for Lambda rendering (legacy timeline)...");
      const resolvedTimelineData = await resolveR2UrlsInTimeline(
        userId,
        body.timelineData,
        [], // No scenes for legacy requests
        86400 // 24 hours
      );

      // Extract render input from request body
      const renderInput: RenderInput = {
        timelineData: resolvedTimelineData,
        compositionWidth: body.compositionWidth,
        compositionHeight: body.compositionHeight,
        durationInFrames: body.durationInFrames,
      };

      // Start Lambda render (validation happens in the service)
      const result = await startLambdaRender(renderInput);

      return Response.json({
        renderId: result.renderId,
        bucketName: result.bucketName,
      });
    }
  } catch (error) {
    console.error("Error starting Lambda render:", error);

    // Determine if this is a validation error or server error
    const errorMessage = error instanceof Error ? error.message : "Failed to start render";

    // Check if error is from validation (more robust detection)
    const isValidationError =
      error instanceof Error &&
      (errorMessage.startsWith("Invalid") || errorMessage.includes("Must be") || errorMessage.includes("Must not be"));

    return Response.json({ error: errorMessage }, { status: isValidationError ? 400 : 500 });
  }
}

/**
 * GET /api/render?renderId=X&bucketName=Y
 * Poll the progress of a Lambda render job
 *
 * Query parameters:
 * - renderId: string (required)
 * - bucketName: string (required)
 *
 * Response:
 * {
 *   done: boolean,
 *   status: 'completed' | 'failed' | 'in_progress',
 *   progress: number, // 0-1
 *   outputFile?: string,
 *   errors?: string[]
 * }
 */
export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication
  await requireUserId(request);

  try {
    const url = new URL(request.url);
    const renderId = url.searchParams.get("renderId");
    const bucketName = url.searchParams.get("bucketName");

    // Validate query parameters (check for null, empty strings, and whitespace-only strings)
    if (!renderId || renderId.trim() === "") {
      return Response.json({ error: "Missing or empty required query parameter: renderId" }, { status: 400 });
    }

    if (!bucketName || bucketName.trim() === "") {
      return Response.json({ error: "Missing or empty required query parameter: bucketName" }, { status: 400 });
    }

    // Poll render progress (validation happens in the service)
    const progress = await pollRenderProgress(renderId, bucketName);

    return Response.json(progress);
  } catch (error) {
    console.error("Error polling render progress:", error);

    // Determine if this is a validation error or server error
    const errorMessage = error instanceof Error ? error.message : "Failed to get render progress";

    // Check if error is from validation (more robust detection)
    const isValidationError =
      error instanceof Error &&
      (errorMessage.startsWith("Invalid") || errorMessage.includes("Must be") || errorMessage.includes("Must not be"));

    return Response.json({ error: errorMessage }, { status: isValidationError ? 400 : 500 });
  }
}
