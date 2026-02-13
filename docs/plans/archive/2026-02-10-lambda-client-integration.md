# Lambda Client Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable API-driven video rendering with a clean, scene-based payload where the client sends only scene IDs and variables, and the API builds the complete timeline from scene templates.

**Architecture:**

1.  **Client:** Sends a minimal, scene-based payload to `POST /api/render` containing only scene IDs, variables, and dimensions.
2.  **API:** Receives the request, fetches scene definitions from the database, builds the complete timeline from scene templates, applies elasticity rules, and sends the fully hydrated payload to Lambda.
3.  **Lambda:** Receives the complete timeline with all scene content and renders the video.

**Tech Stack:** React, React Router 7, Node.js (PostgreSQL), Remotion Lambda

---

## Task 1: Create Scene-Based Render API

**Files:**

- Modify: `app/services/lambda-render.server.ts`
- Modify: `app/routes/api.render.tsx`
- Create: `app/utils/timeline-builder.server.ts` (helper to build timeline from scenes)

**Step 1: Create Timeline Builder Utility**

Create `app/utils/timeline-builder.server.ts`:

```typescript
import type { Scene, TimelineDataItem, TimelineState } from "~/components/timeline/types";
import { transformTimelineToData } from "~/utils/timeline-utils";
import { PIXELS_PER_SECOND } from "~/components/timeline/types";

export interface SceneRenderRequest {
  sceneId: string;
  variables: Record<string, string>;
  duration?: number; // Optional override duration
}

/**
 * Build a complete timeline from an array of scene requests
 */
export function buildTimelineFromScenes(
  sceneRequests: SceneRenderRequest[],
  availableScenes: Scene[],
): { timelineData: TimelineDataItem[]; totalDuration: number } {
  const sceneMap = new Map(availableScenes.map((s) => [s.id, s]));
  const allScrubbers: any[] = [];
  let currentTime = 0;

  for (const request of sceneRequests) {
    const scene = sceneMap.get(request.sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${request.sceneId}`);
    }

    // Transform scene timeline to data
    const sceneTimelineData = transformTimelineToData(scene.timeline, PIXELS_PER_SECOND);

    // Calculate scene duration
    const sceneDuration = request.duration || calculateSceneDuration(sceneTimelineData);

    // Add scene scrubber to timeline
    allScrubbers.push({
      id: `scene-${request.sceneId}-${currentTime}`,
      mediaType: "scene",
      sceneId: request.sceneId,
      variables: request.variables,
      startTime: currentTime,
      endTime: currentTime + sceneDuration,
      duration: sceneDuration,
      trackIndex: 0,
      // ... other required fields
    });

    currentTime += sceneDuration;
  }

  return {
    timelineData: [{ scrubbers: allScrubbers, transitions: {} }],
    totalDuration: currentTime,
  };
}

function calculateSceneDuration(timelineData: TimelineDataItem[]): number {
  let maxEndTime = 0;
  for (const item of timelineData) {
    for (const scrubber of item.scrubbers) {
      if (scrubber.endTime > maxEndTime) {
        maxEndTime = scrubber.endTime;
      }
    }
  }
  return maxEndTime;
}
```

**Step 2: Update RenderInput Type**

Update `RenderInput` interface in `lambda-render.server.ts`:

```typescript
export interface RenderInput {
  timelineData: TimelineDataItem[];
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames: number;
  scenes?: Scene[];
  variableValues?: Record<string, string>;
}
```

**Step 3: Update API Action to Accept Scene-Based Payload**

In `app/routes/api.render.tsx`:

```typescript
import { getProjectScenes } from '~/lib/projects.repo';
import { applyElasticityToTimeline } from '~/utils/elasticity';
import { buildTimelineFromScenes, type SceneRenderRequest } from '~/utils/timeline-builder.server';

export async function action({ request }: ActionFunctionArgs) {
  await requireUserId(request);

  try {
    const body = await request.json();

    // Validate scene-based payload
    if (!body.projectId || typeof body.projectId !== 'string') {
      return Response.json({ error: 'Missing required field: projectId' }, { status: 400 });
    }

    if (!Array.isArray(body.scenes) || body.scenes.length === 0) {
      return Response.json({ error: 'Missing or empty required field: scenes' }, { status: 400 });
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
    if (applyElasticity && projectScenes.length > 0) {
      console.log('Applying elasticity rules to timeline...');
      applyElasticityToTimeline(timelineData, projectScenes);
    }

    // Calculate final duration
    const finalDurationInFrames = Math.ceil(totalDuration * 30); // FPS = 30

    // Start Lambda render
    const result = await startLambdaRender({
      timelineData,
      compositionWidth,
      compositionHeight,
      durationInFrames: finalDurationInFrames,
      scenes: projectScenes,
      variableValues: {}, // Merged from scene requests
    });

    return Response.json({
      renderId: result.renderId,
      bucketName: result.bucketName,
);
  } catch (error) {
    console.error('Error starting Lambda render:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to start render';
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
```

**Step 4: Verification**

- Test the endpoint with a scene-based payload
- Verify timeline is built correctly from scenes
- Check elasticity is applied
- Confirm Lambda receives complete timeline

---

## Task 2: Update useRenderer Hook (Client)

**Files:**

- Modify: `app/hooks/useRenderer.ts`

**Step 1: Update Signature**

Change `handleRenderVideo` to accept scene-based parameters:

```typescript
handleRenderVideo: (
  projectId: string,
  scenes: Array<{
    sceneId: string;
    variables: Record<string, string>;
    duration?: number;
  }>,
  compositionWidth: number,
  compositionHeight: number,
  applyElasticity?: boolean,
) => Promise<void>;
```

**Step 2: Replace Local Server Logic with Lambda API**

Remove:

- Health check to `localhost:8000`
- Synchronous blob download with `responseType: 'blob'`
- All timeline data construction logic

Add:

1.  **Start Render:**

    ```typescript
    const response = await axios.post("/api/render", {
      projectId,
      scenes,
      compositionWidth,
      compositionHeight,
      applyElasticity: applyElasticity !== false, // Default to true
    });

    const { renderId, bucketName } = response.data;
    ```

2.  **Poll Progress:**

    ```typescript
    const pollInterval = setInterval(async () => {
      try {
        const progressRes = await axios.get(`/api/render?renderId=${renderId}&bucketName=${bucketName}`);
        const { done, status, progress, outputFile, errors } = progressRes.data;

        setRenderStatus(`Rendering: ${Math.round(progress * 100)}%`);
        setProgress(Math.round(progress * 100));

        if (done) {
          clearInterval(pollInterval);
          if (status === "completed" && outputFile) {
            // Trigger download
            const link = document.createElement("a");
            link.href = outputFile;
            link.setAttribute("download", "rendered-video.mp4");
            document.body.appendChild(link);
            link.click();
            link.remove();
            setRenderStatus("Video rendered and downloaded successfully!");
          } else {
            setRenderStatus(`Error: ${errors?.join(", ") || "Render failed"}`);
          }
          setIsRendering(false);
        }
      } catch (error) {
        clearInterval(pollInterval);
        setRenderStatus("Error: Failed to check render progress");
        setIsRendering(false);
      }
    }, 2000);
    ```

**Step 3: Add Progress State**

Add to hook state:

```typescript
const [progress, setProgress] = useState<number>(0);
```

Return it:

```typescript
return {
  isRendering,
  renderStatus,
  progress,
  handleRenderVideo,
};
```

---

## Task 3: Update Home UI

**Files:**

- Modify: `app/routes/home.tsx`

**Step 1: Build Scene Render Requests**

Add helper function to convert current timeline to scene requests:

```typescript
const buildSceneRenderRequests = useCallback(() => {
  const requests: Array<{
    sceneId: string;
    variables: Record<string, string>;
    duration?: number;
  }> = [];

  // Extract scene scrubbers from timeline
  const timelineData = getTimelineData();
  for (const item of timelineData) {
    for (const scrubber of item.scrubbers) {
      if (scrubber.mediaType === "scene" && "sceneId" in scrubber) {
        requests.push({
          sceneId: scrubber.sceneId,
          variables: "variables" in scrubber ? scrubber.variables : {},
          duration: scrubber.duration,
        });
      }
    }
  }

  return requests;
}, [getTimelineData]);
```

**Step 2: Update Render Click Handler**

Update `handleRenderClick`:

```typescript
const handleRenderClick = useCallback(() => {
  if (!projectId) {
    toast.error("No project ID found");
    return;
  }

  const sceneRequests = buildSceneRenderRequests();

  if (sceneRequests.length === 0) {
    toast.error("No scenes to render. Add scenes to the timeline first!");
    return;
  }

  handleRenderVideo(
    projectId,
    sceneRequests,
    isAutoSize ? 1920 : width,
    isAutoSize ? 1080 : height,
    true, // applyElasticity
  );

  toast.info("Starting render...");
}, [projectId, buildSceneRenderRequests, handleRenderVideo, width, height, isAutoSize]);
```

**Step 3: Add Progress UI**

Update the render status display:

```typescript
{renderStatus && (
  <div className="fixed bottom-4 right-4 z-50">
    <RenderStatus renderStatus={renderStatus} />
    {isRendering && progress > 0 && (
      <div className="mt-2 w-64 bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    )}
  </div>
)}
```

**Step 4: Cleanup**

Remove any references to local server (port 8000) in error messages.

---

## Task 4: Manual Verification

**Steps:**

1.  Open a project with scenes.
2.  Add scenes to the main timeline.
3.  **Save the project** (Crucial: scenes must be in DB).
4.  Click "Export".
5.  Verify:
    - API request payload is small (~500 bytes, scene-based format).
    - API fetches scenes from database.
    - API builds timeline from scene templates.
    - **Elasticity is applied** (check console logs for duration adjustments).
    - Lambda renders correctly.
    - Progress updates appear (0% → 100%).
    - Video downloads successfully.
    - Videos with "stretch" elasticity rules use their full duration.

---

## Key Design Decisions

### Scene-Based API Design

**Why Scene-Based Instead of Timeline-Based?**

**Problem:** Sending full timeline data from client is:

- Verbose (50KB+ payloads)
- Requires client to understand complex timeline structure
- Not friendly for external API consumers
- Difficult to maintain and version

**Solution:** Scene-based payload where:

1.  Client sends only scene IDs, variables, and durations
2.  API fetches scene definitions (templates) from database
3.  API builds the complete timeline from scene templates
4.  API applies elasticity and sends to Lambda

**Benefits:**

- ✅ Tiny payloads (~500 bytes)
- ✅ Client-friendly API contract
- ✅ Scenes are reusable templates
- ✅ Perfect for API-driven video generation
- ✅ Easy to version and maintain

### Elasticity (Option A: Server-Side)

**What is Elasticity?**

- Elasticity rules control how scrubber durations are calculated during rendering
- **`fixed`**: Use the duration set in the editor (default)
- **`stretch`**: Expand to match actual media duration (e.g., full video length)

**Why Server-Side?**

- Applied in `api.render.tsx` after fetching scenes, before sending to Lambda
- Lambda receives the final, adjusted timeline
- Consistent with the existing local render server implementation
- Simpler Lambda payload (no need to pass elasticity logic)

**Implementation:**

```typescript
// In api.render.tsx
import { applyElasticityToTimeline } from "~/utils/elasticity";

// After fetching scenes and filtering
if (applyElasticity && usedScenes.length > 0) {
  applyElasticityToTimeline(processedTimelineData, usedScenes);
}
```

### Payload Structure

**Client → API (Scene-Based - Clean & Simple):**

```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "scenes": [
    {
      "sceneId": "scene-intro",
      "variables": {
        "title": "Welcome to Our Product",
        "subtitle": "Get Started Today"
      },
      "duration": 5.0
    },
    {
      "sceneId": "scene-main-content",
      "variables": {
        "name": "John Doe",
        "product": "Amazing Product",
        "price": "$99"
      },
      "duration": 10.0
    },
    {
      "sceneId": "scene-outro",
      "variables": {
        "cta": "Visit our website",
        "url": "example.com"
      },
      "duration": 3.0
    }
  ],
  "compositionWidth": 1920,
  "compositionHeight": 1080,
  "applyElasticity": true
}
```

**Benefits of Scene-Based Payload:**

- ✅ **Tiny payload**: ~500 bytes (vs 50KB+ with full timeline)
- ✅ **Client-friendly**: No need to understand timeline structure
- ✅ **Reusable templates**: Scenes are templates stored in DB
- ✅ **API-driven**: Perfect for external API consumers
- ✅ **Type-safe**: Clear contract between client and server

**API → Lambda:**

```json
{
  "timelineData": [...],
  "scenes": [
    { "id": "scene-1", "timeline": {...}, "variableSchema": [...] }
  ],
  "variableValues": { "name": "John" },
  "compositionWidth": 1920,
  "compositionHeight": 1080,
  "durationInFrames": 300,
  "isRendering": true,
  "getPixelsPerSecond": 100
}
```

---

## Environment Variables Required

Already configured:

```bash
REMOTION_FUNCTION_NAME=remotion-render-4-0-420-mem2048mb-disk2048mb-120sec
REMOTION_SERVE_URL=https://remotionlambda-euwest3-x1kx4pjn4s.s3.eu-west-3.amazonaws.com/sites/kimu-video-renderer/index.html
REMOTION_BUCKET_NAME=remotionlambda-euwest3-x1kx4pjn4s
REMOTION_AWS_ACCESS_KEY_ID=***
REMOTION_AWS_SECRET_ACCESS_KEY=***
REMOTION_AWS_REGION=eu-west-3
```

---

## Progress Status

**TODO:**

- ⏳ Task 1: Update Render API Schema & Service
- ⏳ Task 2: Update useRenderer Hook
- ⏳ Task 3: Update Home UI
- ⏳ Task 4: Manual Verification

---

## Next Steps After Completion

1.  Update P0 plan progress (mark Phase 3 as complete).
2.  Proceed to Phase 4: Scene-by-ID rendering endpoint.
3.  Consider adding a database table to track render jobs.
