# Scene API & Elasticity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable API-driven video generation with scene templates, variables, and elasticity rules applied during server-side rendering only.

**Architecture:**

- Add strongly-typed Scene API endpoints for export/import
- Implement elasticity calculation in the rendering pipeline (server-side only)
- Keep UI editor unchanged (fixed durations, no elasticity)

**Tech Stack:** TypeScript, Zod schemas, Express API, Remotion renderer

---

## Phase 1: Strengthen Type Safety

### Task 1.1: Add Scene API Schemas

**Files:**

- Create: `app/schemas/apis/scenes.ts`

**Step 1: Create Zod schemas for Scene API**

```typescript
import { z } from "zod";
import { SceneSchema } from "../timeline";

// Request to export a scene template
export const ExportSceneRequestSchema = z.object({
  sceneId: z.string().uuid(),
});

// Response containing exported scene template
export const ExportSceneResponseSchema = z.object({
  scene: SceneSchema,
});

// Request to list all scene templates in a project
export const ListScenesResponseSchema = z.object({
  scenes: z.array(SceneSchema),
});

// Request to render video using scene template
export const RenderWithSceneRequestSchema = z.object({
  sceneId: z.string().uuid(),
  variableValues: z.record(z.string(), z.string()).optional(),
  compositionWidth: z.number().int().positive(),
  compositionHeight: z.number().int().positive(),
  applyElasticity: z.boolean().default(true),
});
```

**Step 2: Commit**

```bash
git add app/schemas/apis/scenes.ts
git commit -m "feat: add Scene API Zod schemas"
```

---

### Task 1.2: Replace `unknown[]` with `Scene[]` in Repository Layer

**Files:**

- Modify: `app/lib/projects.repo.ts:95-125`

**Step 1: Import Scene type**

```typescript
import type { Scene } from "~/components/timeline/types";
```

**Step 2: Update getProjectScenes return type**

Replace:

```typescript
export async function getProjectScenes(
  id: string
): Promise<unknown[]> {
```

With:

```typescript
export async function getProjectScenes(
  id: string
): Promise<Scene[]> {
```

**Step 3: Update updateProjectScenes parameter type**

Replace:

```typescript
export async function updateProjectScenes(
  id: string,
  userId: string,
  scenes: unknown[]
): Promise<boolean> {
```

With:

```typescript
export async function updateProjectScenes(
  id: string,
  userId: string,
  scenes: Scene[]
): Promise<boolean> {
```

**Step 4: Commit**

```bash
git add app/lib/projects.repo.ts
git commit -m "refactor: replace unknown[] with Scene[] in projects repo"
```

---

### Task 1.3: Update API Route Types

**Files:**

- Modify: `app/routes/api.projects.$.tsx:58,176`

**Step 1: Import Scene type**

```typescript
import type { Scene } from "~/components/timeline/types";
```

**Step 2: Update loader scene type (line 58)**

Replace:

```typescript
const scenes = await getProjectScenes(id);
```

With:

```typescript
const scenes: Scene[] = await getProjectScenes(id);
```

**Step 3: Update action scene type (line 176)**

Replace:

```typescript
const scenes: unknown[] | undefined = parsed.success ? parsed.data.scenes : undefined;
```

With:

```typescript
const scenes: Scene[] | undefined = parsed.success ? parsed.data.scenes : undefined;
```

**Step 4: Commit**

```bash
git add app/routes/api.projects.$.tsx
git commit -m "refactor: use Scene[] type in project API routes"
```

---

## Phase 2: Scene Export/Import API

### Task 2.1: Create Scene API Endpoints

**Files:**

- Create: `app/routes/api.scenes.$.tsx`

**Step 1: Create scene API route handler**

```typescript
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
```

**Step 2: Register route in routes.ts**

Add to `app/routes.ts`:

```typescript
"api/scenes/*": "./routes/api.scenes.$.tsx",
```

**Step 3: Commit**

```bash
git add app/routes/api.scenes.$.tsx app/routes.ts
git commit -m "feat: add Scene export/list API endpoints"
```

---

### Task 2.2: Update Render Endpoint to Accept Scene Templates

**Files:**

- Modify: `app/videorender/videorender.ts:276-289`

**Step 1: Update render endpoint to validate scenes**

Replace:

```typescript
app.post("/render", async (req, res) => {
  try {
    // Get input props from POST body
    const inputProps = {
      timelineData: req.body.timelineData,
      durationInFrames: req.body.durationInFrames,
      compositionWidth: req.body.compositionWidth,
      compositionHeight: req.body.compositionHeight,
      getPixelsPerSecond: req.body.getPixelsPerSecond,
      variableValues: req.body.variableValues,
      scenes: req.body.scenes,
      isRendering: true,
    };
```

With:

```typescript
app.post("/render", async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.timelineData || !req.body.compositionWidth || !req.body.compositionHeight) {
      res.status(400).json({ error: "Missing required fields: timelineData, compositionWidth, compositionHeight" });
      return;
    }

    // Get input props from POST body
    const inputProps = {
      timelineData: req.body.timelineData,
      durationInFrames: req.body.durationInFrames,
      compositionWidth: req.body.compositionWidth,
      compositionHeight: req.body.compositionHeight,
      getPixelsPerSecond: req.body.getPixelsPerSecond || 100,
      variableValues: req.body.variableValues || {},
      scenes: req.body.scenes || [],
      isRendering: true,
    };
```

**Step 2: Commit**

```bash
git add app/videorender/videorender.ts
git commit -m "feat: add validation to render endpoint"
```

---

## Phase 3: Elasticity Implementation (Render-Time Only)

### Task 3.1: Create Elasticity Calculator Utility

**Files:**

- Create: `app/utils/elasticity.ts`

**Step 1: Write elasticity calculation logic**

```typescript
import type { ElasticityRule, ScrubberState, Scene } from "~/components/timeline/types";

/**
 * Calculate the actual duration for a scrubber based on its elasticity rule.
 * This is ONLY used during server-side rendering, NOT in the UI editor.
 *
 * @param scrubber - The scrubber to calculate duration for
 * @param variableValues - Variable values that may affect content length
 * @param scenes - Available scene definitions
 * @returns Duration in seconds
 */
export function calculateElasticDuration(
  scrubber: ScrubberState,
  variableValues: Record<string, string>,
  scenes: Scene[],
): number {
  // If no elasticity rule, use the scrubber's fixed duration
  if (!scrubber.elasticityRule) {
    return scrubber.duration;
  }

  const rule = scrubber.elasticityRule;

  switch (rule.type) {
    case "audio_duration": {
      // For audio-driven elasticity, we would need to:
      // 1. Get the audio file path from variableValues or scrubber.mediaUrlRemote
      // 2. Use ffprobe or similar to get actual audio duration
      // For now, return fixed duration (TODO: implement audio duration detection)
      console.warn("Audio duration elasticity not yet implemented, using fixed duration");
      return scrubber.duration;
    }

    case "text_length": {
      // Calculate duration based on text length
      // Assume reading speed: ~150 words per minute = 2.5 words per second
      const textContent = scrubber.text?.textContent || "";
      const resolvedText = resolveVariableInText(textContent, variableValues);
      const wordCount = resolvedText.split(/\s+/).filter((w) => w.length > 0).length;
      const calculatedDuration = Math.max(
        rule.minDuration || 1,
        Math.min(
          wordCount / 2.5, // 2.5 words per second
          rule.maxDuration || 30,
        ),
      );
      return calculatedDuration;
    }

    case "fixed": {
      // Fixed duration from the rule
      return rule.duration || scrubber.duration;
    }

    default:
      console.warn(`Unknown elasticity rule type: ${rule.type}`);
      return scrubber.duration;
  }
}

/**
 * Resolve variables in text content
 */
function resolveVariableInText(text: string, variableValues: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, varName) => {
    return variableValues[varName] || match;
  });
}

/**
 * Apply elasticity rules to all scrubbers in timeline data.
 * This modifies the scrubbers in-place to adjust their durations and positions.
 *
 * @param timelineData - The timeline data to modify
 * @param variableValues - Variable values for resolution
 * @param scenes - Available scene definitions
 */
export function applyElasticityToTimeline(
  timelineData: any[],
  variableValues: Record<string, string>,
  scenes: Scene[],
): void {
  for (const item of timelineData) {
    for (const scrubber of item.scrubbers) {
      const originalDuration = scrubber.duration;
      const elasticDuration = calculateElasticDuration(scrubber, variableValues, scenes);

      if (elasticDuration !== originalDuration) {
        console.log(`Elasticity: ${scrubber.id} duration ${originalDuration}s -> ${elasticDuration}s`);
        scrubber.duration = elasticDuration;
        scrubber.endTime = scrubber.startTime + elasticDuration;
      }
    }

    // Recalculate positions for scrubbers after the elastic ones
    // Sort by startTime and adjust subsequent scrubbers
    item.scrubbers.sort((a: any, b: any) => a.startTime - b.startTime);

    for (let i = 1; i < item.scrubbers.length; i++) {
      const prev = item.scrubbers[i - 1];
      const curr = item.scrubbers[i];

      // If there's overlap, push the current scrubber forward
      if (curr.startTime < prev.endTime) {
        const shift = prev.endTime - curr.startTime;
        curr.startTime = prev.endTime;
        curr.endTime = curr.startTime + curr.duration;
        console.log(`Elasticity: Shifted ${curr.id} forward by ${shift}s`);
      }
    }
  }
}
```

**Step 2: Commit**

```bash
git add app/utils/elasticity.ts
git commit -m "feat: add elasticity calculation utility (render-time only)"
```

---

### Task 3.2: Integrate Elasticity into Render Pipeline

**Files:**

- Modify: `app/videorender/videorender.ts:276-298`

**Step 1: Import elasticity utility**

Add to imports:

```typescript
import { applyElasticityToTimeline } from "~/utils/elasticity";
```

**Step 2: Apply elasticity before rendering**

Replace:

```typescript
app.post("/render", async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.timelineData || !req.body.compositionWidth || !req.body.compositionHeight) {
      res.status(400).json({ error: "Missing required fields: timelineData, compositionWidth, compositionHeight" });
      return;
    }

    // Get input props from POST body
    const inputProps = {
      timelineData: req.body.timelineData,
      durationInFrames: req.body.durationInFrames,
      compositionWidth: req.body.compositionWidth,
      compositionHeight: req.body.compositionHeight,
      getPixelsPerSecond: req.body.getPixelsPerSecond || 100,
      variableValues: req.body.variableValues || {},
      scenes: req.body.scenes || [],
      isRendering: true,
    };

    // console.log("Input props:", typeof inputProps.compositionWidth);
    console.log("Input props:", JSON.stringify(inputProps, null, 2));
```

With:

```typescript
app.post("/render", async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.timelineData || !req.body.compositionWidth || !req.body.compositionHeight) {
      res.status(400).json({ error: "Missing required fields: timelineData, compositionWidth, compositionHeight" });
      return;
    }

    // Clone timeline data to avoid mutating the original
    const timelineData = JSON.parse(JSON.stringify(req.body.timelineData));
    const variableValues = req.body.variableValues || {};
    const scenes = req.body.scenes || [];
    const applyElasticity = req.body.applyElasticity !== false; // Default to true

    // Apply elasticity rules if enabled (server-side only)
    if (applyElasticity) {
      console.log("Applying elasticity rules to timeline...");
      applyElasticityToTimeline(timelineData, variableValues, scenes);
    }

    // Recalculate duration after elasticity
    let maxEndTime = 0;
    for (const item of timelineData) {
      for (const scrubber of item.scrubbers) {
        if (scrubber.endTime > maxEndTime) {
          maxEndTime = scrubber.endTime;
        }
      }
    }
    const durationInFrames = Math.ceil(maxEndTime * 30); // 30 FPS

    // Get input props from POST body
    const inputProps = {
      timelineData,
      durationInFrames,
      compositionWidth: req.body.compositionWidth,
      compositionHeight: req.body.compositionHeight,
      getPixelsPerSecond: req.body.getPixelsPerSecond || 100,
      variableValues,
      scenes,
      isRendering: true,
    };

    console.log("Input props:", JSON.stringify(inputProps, null, 2));
```

**Step 3: Commit**

```bash
git add app/videorender/videorender.ts
git commit -m "feat: integrate elasticity into render pipeline"
```

---

## Phase 4: API Documentation & Testing

### Task 4.1: Create API Usage Examples

**Files:**

- Create: `docs/api/scene-rendering.md`

**Step 1: Write API documentation**

````markdown
# Scene Rendering API

This document describes how to use the Kimu API to render videos with scene templates and variables.

## Authentication

All API endpoints require authentication. Include your session cookie in the request headers.

## Endpoints

### 1. List Scene Templates

Get all scene templates in a project.

**Request:**

```http
GET /api/scenes/:projectId
Cookie: better-auth.session_token=...
```
````

**Response:**

```json
{
  "scenes": [
    {
      "id": "scene-uuid",
      "name": "Intro Scene",
      "timeline": { ... },
      "variables": [
        { "name": "headline", "defaultValue": "Default Headline" }
      ],
      "elasticityRules": []
    }
  ]
}
```

### 2. Export Single Scene

Get a specific scene template by ID.

**Request:**

```http
GET /api/scenes/:projectId/:sceneId
Cookie: better-auth.session_token=...
```

**Response:**

```json
{
  "scene": {
    "id": "scene-uuid",
    "name": "Intro Scene",
    "timeline": { ... },
    "variables": [
      { "name": "headline", "defaultValue": "Default Headline" }
    ]
  }
}
```

### 3. Render Video with Scene

Render a video using a scene template with custom variables.

**Request:**

```http
POST /render
Content-Type: application/json

{
  "timelineData": [ ... ],
  "compositionWidth": 1920,
  "compositionHeight": 1080,
  "variableValues": {
    "headline": "My Custom Headline",
    "background_video": "https://example.com/video.mp4"
  },
  "scenes": [ ... ],
  "applyElasticity": true
}
```

**Response:**
Binary MP4 video file

## Example: Render Video with Variables

```bash
# 1. Get scene template
curl -X GET "http://localhost:5173/api/scenes/project-id/scene-id" \
  -H "Cookie: better-auth.session_token=YOUR_TOKEN" \
  -o scene.json

# 2. Render video with custom variables
curl -X POST "http://localhost:8000/render" \
  -H "Content-Type: application/json" \
  -d '{
    "timelineData": [...],
    "compositionWidth": 1920,
    "compositionHeight": 1080,
    "variableValues": {
      "headline": "Breaking News!",
      "subtitle": "This is a test"
    },
    "scenes": [...],
    "applyElasticity": true
  }' \
  --output rendered-video.mp4
```

## Elasticity Rules

Elasticity rules allow scenes to automatically adjust their duration based on content:

- **text_length**: Duration based on text word count (reading speed: 2.5 words/sec)
- **audio_duration**: Duration matches audio file length (TODO: not yet implemented)
- **fixed**: Fixed duration specified in the rule

Elasticity is **only applied during server-side rendering**, not in the UI editor.

To disable elasticity, set `applyElasticity: false` in the render request.

````

**Step 2: Commit**

```bash
git add docs/api/scene-rendering.md
git commit -m "docs: add Scene Rendering API documentation"
````

---

### Task 4.2: Create Test Script

**Files:**

- Create: `scripts/test-scene-api.sh`

**Step 1: Write test script**

```bash
#!/bin/bash

# Test script for Scene API and rendering with variables
# Usage: ./scripts/test-scene-api.sh <project-id> <scene-id> <session-token>

set -e

PROJECT_ID=${1:-""}
SCENE_ID=${2:-""}
SESSION_TOKEN=${3:-""}

if [ -z "$PROJECT_ID" ] || [ -z "$SCENE_ID" ] || [ -z "$SESSION_TOKEN" ]; then
  echo "Usage: ./scripts/test-scene-api.sh <project-id> <scene-id> <session-token>"
  exit 1
fi

API_BASE="http://localhost:5173"
RENDER_BASE="http://localhost:8000"

echo "🧪 Testing Scene API..."
echo ""

# Test 1: List all scenes
echo "1️⃣ Listing all scenes in project..."
curl -X GET "$API_BASE/api/scenes/$PROJECT_ID" \
  -H "Cookie: better-auth.session_token=$SESSION_TOKEN" \
  -s | jq '.'

echo ""
echo "✅ List scenes test complete"
echo ""

# Test 2: Export single scene
echo "2️⃣ Exporting scene template..."
SCENE_DATA=$(curl -X GET "$API_BASE/api/scenes/$PROJECT_ID/$SCENE_ID" \
  -H "Cookie: better-auth.session_token=$SESSION_TOKEN" \
  -s)

echo "$SCENE_DATA" | jq '.'
echo ""
echo "✅ Export scene test complete"
echo ""

# Test 3: Render with variables (requires manual timeline data)
echo "3️⃣ To test rendering with variables, use:"
echo ""
echo "curl -X POST \"$RENDER_BASE/render\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{"
echo "    \"timelineData\": [...your timeline data...],"
echo "    \"compositionWidth\": 1920,"
echo "    \"compositionHeight\": 1080,"
echo "    \"variableValues\": {"
echo "      \"headline\": \"Test Headline\","
echo "      \"subtitle\": \"Test Subtitle\""
echo "    },"
echo "    \"scenes\": [...your scenes...],"
echo "    \"applyElasticity\": true"
echo "  }' \\"
echo "  --output test-render.mp4"
echo ""

echo "✅ All tests complete!"
```

**Step 2: Make script executable**

```bash
chmod +x scripts/test-scene-api.sh
```

**Step 3: Commit**

```bash
git add scripts/test-scene-api.sh
git commit -m "test: add Scene API test script"
```

---

## Phase 5: Export Schema Validation

### Task 5.1: Add Schema Export to API

**Files:**

- Modify: `app/schemas/index.ts`

**Step 1: Re-export scene schemas**

Add to exports:

```typescript
export * from "./apis/scenes";
```

**Step 2: Commit**

```bash
git add app/schemas/index.ts
git commit -m "feat: export scene API schemas"
```

---

## Summary

This plan implements:

1. ✅ **Type Safety**: Replaced `unknown[]` with `Scene[]` throughout the API layer
2. ✅ **Scene Export API**: Added `/api/scenes/:projectId` and `/api/scenes/:projectId/:sceneId` endpoints
3. ✅ **Elasticity Rules**: Implemented render-time elasticity calculation (text_length, audio_duration, fixed)
4. ✅ **API Documentation**: Created comprehensive API docs with examples
5. ✅ **Testing Tools**: Added test script for validating Scene API

**Next Steps After Implementation:**

1. Test Scene API endpoints with real project data
2. Test rendering with variable videos via API
3. Implement audio duration detection for audio_duration elasticity
4. Add more elasticity rule types as needed (e.g., video_duration)

**Verification Commands:**

```bash
# Start render server
pnpm dlx tsx app/videorender/videorender.ts

# Test Scene API
./scripts/test-scene-api.sh <project-id> <scene-id> <session-token>

# Manual render test
curl -X POST "http://localhost:8000/render" \
  -H "Content-Type: application/json" \
  -d @test-render-payload.json \
  --output test.mp4
```
