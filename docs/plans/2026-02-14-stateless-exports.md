# Stateless Exports Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify exports by removing database tracking and using R2 as the single source of truth for rendered videos.

**Architecture:**
1.  **Storage:** Store renders in R2 under `userId/renders/`.
2.  **Listing:** The Exports API will list objects directly from R2 using `userId/renders/` prefix.
3.  **Cleanup:** Remove `exports` table and related database code.
4.  **Frontend:** Update `api.exports` to return R2 objects transformed to match `Export` interface.

**Tech Stack:** React Router (Remix), AWS SDK (S3/R2), Docker Render Adapter.

---

### Task 1: Update Render Storage Path

**Files:**
- Modify: `app/services/render/renderer.ts`
- Modify: `app/services/docker-render-adapter.ts`
- Modify: `app/services/render-adapter.interface.ts`
- Modify: `app/routes/api.render.tsx`

**Step 1: Update `renderer.ts` to use userId prefix**

We need `userId` passed to `executeRender`.

```typescript
// app/services/render/renderer.ts

// Update signature
export async function executeRender(
  jobId: string,
  userId: string, // Add this
  data: RenderJobData,
  onProgress: (progress: number) => void | Promise<void>,
): Promise<string> {
    // ...
    // Update key
    const r2Key = `${userId}/renders/${jobId}.mp4`;
    // ...
}
```

**Step 2: Update `RenderInput` interface**

```typescript
// app/services/render-adapter.interface.ts
export interface RenderInput {
  userId: string; // Add this
  // ...
}
```

**Step 3: Update `docker-render-adapter.ts`**

Update `startRender` to include `userId` in the request body sent to docker service.

```typescript
// app/services/docker-render-adapter.ts
async startRender(input: RenderInput): Promise<StartRenderResult> {
    // ...
    const requestBody = {
        userId: input.userId, // Add this
        // ...
    };
    // ...
}
```

**Step 4: Update `api.render.tsx`**

Pass `userId` when calling `adapter.startRender`.

```typescript
// app/routes/api.render.tsx
const renderInput: RenderInput = {
    userId, // Add this
    // ...
};
```

**Step 5: Commit**

```bash
git add app/services/render/renderer.ts app/services/render-adapter.interface.ts app/services/docker-render-adapter.ts app/routes/api.render.tsx
git commit -m "feat: use userId/renders path for storage"
```

---

### Task 2: Update Render Service Routes

**Files:**
- Modify: `app/services/render/routes.ts`

**Step 1: Update POST /render handler**

Ensure it accepts `userId` from body and passes it to `executeRender`.

```typescript
// app/services/render/routes.ts
// const { userId, ...data } = req.body;
// if (!userId) throw new Error("userId required");
// await executeRender(jobId, userId, data, ...);
```

**Step 2: Commit**

```bash
git add app/services/render/routes.ts
git commit -m "feat: update render service to handle userId"
```

---

### Task 3: Rewrite API Exports

**Files:**
- Modify: `app/routes/api.exports.$.tsx`
- Modify: `app/lib/r2-client.ts`

**Step 1: Add `listUserRenders` to `r2-client.ts`**

```typescript
// app/lib/r2-client.ts
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function listUserRenders(userId: string) {
  const command = new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET_NAME,
    Prefix: `${userId}/renders/`,
  });
  const { Contents } = await s3Client.send(command);
  
  // Sort by LastModified desc
  return (Contents || [])
    .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
    .map(obj => ({
      key: obj.Key,
      lastModified: obj.LastModified?.toISOString(),
      size: obj.Size,
      url: `${process.env.R2_PUBLIC_URL}/${obj.Key}`
    }));
}
```

**Step 2: Update `api.exports.$.tsx`**

Replace DB query with `listUserRenders`. Map R2 objects to the `Export` interface expected by frontend.

```typescript
// app/routes/api.exports.$.tsx
import { listUserRenders } from "~/lib/r2-client";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const renders = await listUserRenders(userId);
  
  // Transform to match expected frontend format
  const exports = renders.map(r => ({
    id: r.key?.split('/').pop()?.replace('.mp4', '') || 'unknown',
    label: "Rendered Video", // Default label since we lost metadata
    thumbnailUrl: null, // No thumbnails for now
    videoUrl: r.url,
    duration_seconds: null, // Unknown
    file_size_bytes: r.size,
    created_at: r.lastModified,
    render_status: 'completed',
  }));

  return Response.json({ exports });
}
```

**Step 3: Update `ExportsPanel.tsx` (optional cleanup)**

We are strictly keeping the interface, so no changes needed there, but we should verify it handles nulls gracefully (it seems to based on the types).

**Step 4: Commit**

```bash
git add app/lib/r2-client.ts app/routes/api.exports.$.tsx
git commit -m "feat: fetch exports from R2 directly"
```

---

### Task 4: Cleanup Database

**Files:**
- Create: `migrations/013_drop_exports.sql`
- Run: `npx tsx app/lib/migrate.ts`

**Step 1: Create migration**

```sql
-- migrations/013_drop_exports.sql
DROP TABLE IF EXISTS exports;
```

**Step 2: Run migration**

```bash
npx tsx app/lib/migrate.ts
```

**Step 3: Commit**

```bash
git add migrations/013_drop_exports.sql
git commit -m "db: remove exports table"
```

---

### Task 5: Cleanup Codebase

**Files:**
- Modify: `app/lib/projects.repo.ts`
- Modify: `app/routes/api.webhooks.render-complete.tsx`

**Step 1: Remove export functions from `projects.repo.ts`**

Remove `listExportsByProject`, `deleteExportById`, `updateExportMetadata` etc.

**Step 2: Delete `api.webhooks.render-complete.tsx`**

It is no longer needed.

**Step 3: Commit**

```bash
git add app/lib/projects.repo.ts
git rm app/routes/api.webhooks.render-complete.tsx
git commit -m "chore: cleanup dead exports code"
```
