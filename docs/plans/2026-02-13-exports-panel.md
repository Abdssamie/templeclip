# Exports Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Exports panel to the left sidebar that displays rendered videos with download capability (no redirect), using persistent toast notifications during render.

**Architecture:** Extend the exports table to store metadata (duration, label, thumbnail), create a new Exports panel component that fetches project exports, implement authenticated blob downloads via fetch+save dialog, and update render flow to save thumbnails post-render.

**Tech Stack:** React Router, PostgreSQL, Radix UI Dropdown Menu, Sonner toast, Fetch API

---

## Pre-Read Required

- `/app/components/editor/LeftPanel.tsx` - How left panel tabs work
- `/app/hooks/useRenderer.ts` - Current render flow (we'll modify toast persistence)
- `/app/lib/projects.repo.ts` - Project queries pattern
- `/migrations/007_exports.sql` - Existing exports schema

---

### Task 1: Database Migration - Add Export Metadata Columns

**Files:**

- Create: `migrations/011_export_metadata.sql`
- Modify: `app/lib/projects.repo.ts` (add exports queries)

**Step 1: Create migration file**

```sql
-- Add export metadata columns for UI display
ALTER TABLE exports
  ADD COLUMN IF NOT EXISTS thumbnail_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds int,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint;

-- Index for thumbnail lookups
CREATE INDEX IF NOT EXISTS idx_exports_thumbnail ON exports(thumbnail_asset_id);

COMMENT ON COLUMN exports.thumbnail_asset_id IS 'Thumbnail image asset reference';
COMMENT ON COLUMN exports.duration_seconds IS 'Video duration in seconds';
COMMENT ON COLUMN exports.label IS 'User-friendly label: "Timeline" or scene name';
COMMENT ON COLUMN exports.file_size_bytes IS 'Video file size in bytes';
```

**Step 2: Run migration**

```bash
pnpm migrate
```

Expected: Migration completes successfully

**Step 3: Add exports queries to projects.repo.ts**

Add to `/app/lib/projects.repo.ts` after line 137:

```typescript
export type ExportRecord = {
  id: string;
  user_id: string;
  project_id: string;
  render_status: string;
  output_asset_id: string | null;
  thumbnail_asset_id: string | null;
  duration_seconds: number | null;
  label: string | null;
  file_size_bytes: number | null;
  created_at: string;
  completed_at: string | null;
  render_error: string | null;
};

export async function listExportsByProject(projectId: string, userId: string): Promise<ExportRecord[]> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<ExportRecord>(
      `SELECT * FROM exports 
       WHERE project_id = $1 AND user_id = $2 
       ORDER BY created_at DESC`,
      [projectId, userId],
    );
    return rows;
  } finally {
    client.release();
  }
}

export async function deleteExportById(exportId: string, userId: string): Promise<boolean> {
  const client = await getPool().connect();
  try {
    const { rowCount } = await client.query(`DELETE FROM exports WHERE id = $1 AND user_id = $2`, [exportId, userId]);
    return (rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function updateExportMetadata(
  exportId: string,
  metadata: {
    thumbnailAssetId?: string;
    durationSeconds?: number;
    label?: string;
    fileSizeBytes?: number;
  },
): Promise<boolean> {
  const client = await getPool().connect();
  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (metadata.thumbnailAssetId !== undefined) {
      updates.push(`thumbnail_asset_id = $${paramIndex++}`);
      values.push(metadata.thumbnailAssetId);
    }
    if (metadata.durationSeconds !== undefined) {
      updates.push(`duration_seconds = $${paramIndex++}`);
      values.push(metadata.durationSeconds);
    }
    if (metadata.label !== undefined) {
      updates.push(`label = $${paramIndex++}`);
      values.push(metadata.label);
    }
    if (metadata.fileSizeBytes !== undefined) {
      updates.push(`file_size_bytes = $${paramIndex++}`);
      values.push(metadata.fileSizeBytes);
    }

    if (updates.length === 0) return false;

    values.push(exportId);
    const query = `UPDATE exports SET ${updates.join(", ")} WHERE id = $${paramIndex}`;
    const { rowCount } = await client.query(query, values);
    return (rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
```

**Step 4: Commit**

```bash
git add migrations/011_export_metadata.sql app/lib/projects.repo.ts
git commit -m "feat: add export metadata columns and queries"
```

---

### Task 2: Create Exports API Route

**Files:**

- Create: `app/routes/api.exports.$.tsx`

**Step 1: Create the API route file**

```typescript
import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUserId } from "~/lib/auth.utils";
import { listExportsByProject, deleteExportById } from "~/lib/projects.repo";
import { getPool } from "~/lib/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return new Response(JSON.stringify({ error: "projectId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const exports = await listExportsByProject(projectId, userId);

    // Join with assets to get file URLs
    const pool = getPool();
    const client = await pool.connect();
    try {
      const exportsWithAssets = await Promise.all(
        exports.map(async (exp) => {
          let videoUrl = null;
          let thumbnailUrl = null;

          if (exp.output_asset_id) {
            const { rows: videoRows } = await client.query(`SELECT public_url FROM assets WHERE id = $1`, [
              exp.output_asset_id,
            ]);
            videoUrl = videoRows[0]?.public_url ?? null;
          }

          if (exp.thumbnail_asset_id) {
            const { rows: thumbRows } = await client.query(`SELECT public_url FROM assets WHERE id = $1`, [
              exp.thumbnail_asset_id,
            ]);
            thumbnailUrl = thumbRows[0]?.public_url ?? null;
          }

          return {
            ...exp,
            videoUrl,
            thumbnailUrl,
          };
        }),
      );

      return new Response(JSON.stringify({ exports: exportsWithAssets }), {
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to list exports:", error);
    return new Response(JSON.stringify({ error: "Failed to list exports" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const DeleteExportSchema = z.object({
  exportId: z.string().uuid(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  if (request.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { exportId } = DeleteExportSchema.parse(body);

    const success = await deleteExportById(exportId, userId);

    if (!success) {
      return new Response(JSON.stringify({ error: "Export not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: "Invalid request", details: error.issues }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Failed to delete export:", error);
    return new Response(JSON.stringify({ error: "Failed to delete export" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

**Step 2: Commit**

```bash
git add app/routes/api.exports.$.tsx
git commit -m "feat: add exports API route for listing and deleting"
```

---

### Task 3: Create ExportCard Component

**Files:**

- Create: `app/components/exports/ExportCard.tsx`

**Step 1: Create component file**

```typescript
import { Download, Film } from "lucide-react";
import { Button } from "~/components/ui/button";

interface ExportCardProps {
  id: string;
  label: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  videoUrl: string | null;
  isDownloading: boolean;
  onDownload: (url: string, filename: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExportCard({
  id,
  label,
  thumbnailUrl,
  durationSeconds,
  createdAt,
  videoUrl,
  isDownloading,
  onDownload,
}: ExportCardProps) {
  const displayLabel = label || "Untitled Export";
  const filename = `${displayLabel.replace(/\s+/g, "_")}_${new Date(createdAt).getTime()}.mp4`;

  return (
    <div
      className="group relative bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-muted relative">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayLabel}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Film className="h-8 w-8" />
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
          {formatDuration(durationSeconds)}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" title={displayLabel}>
              {displayLabel}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(createdAt)}</p>
          </div>
          {videoUrl && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => onDownload(videoUrl, filename)}
              disabled={isDownloading}
              title="Download video"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/exports/ExportCard.tsx
git commit -m "feat: add ExportCard component"
```

---

### Task 4: Create ExportsPanel Component

**Files:**

- Create: `app/components/exports/ExportsPanel.tsx`

**Step 1: Create component file**

```typescript
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Film, Download, Trash2, Loader2, MoreVertical } from "lucide-react";
import { ExportCard } from "./ExportCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";

interface Export {
  id: string;
  label: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  created_at: string;
  render_status: string;
}

interface ExportsPanelProps {
  projectId: string;
  refreshKey?: number;
}

export function ExportsPanel({ projectId, refreshKey }: ExportsPanelProps) {
  const [exports, setExports] = useState<Export[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const fetchExports = useCallback(async () => {
    try {
      const response = await axios.get(`/api/exports?projectId=${projectId}`);
      setExports(response.data.exports);
    } catch (error) {
      console.error("Failed to fetch exports:", error);
      toast.error("Failed to load exports");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchExports();
  }, [fetchExports, refreshKey]);

  const handleDownload = async (url: string, filename: string) => {
    setIsDownloading(filename);
    try {
      // Fetch as blob to avoid redirect
      const response = await axios.get(url, {
        responseType: "blob",
      });

      // Create blob URL and trigger download
      const blob = new Blob([response.data], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Clean up blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      toast.success("Video download started");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download video");
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDelete = async (exportId: string) => {
    try {
      await axios.delete("/api/exports", {
        data: { exportId },
      });
      setExports((prev) => prev.filter((e) => e.id !== exportId));
      toast.success("Export deleted");
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete export");
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (exports.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Film className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium text-sm mb-2">No exports yet</h3>
        <p className="text-sm text-muted-foreground">
          Click the <strong>Export</strong> button in the header to render your video
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-3">
        {exports.map((exp) => (
          <div key={exp.id} className="relative group">
            <ExportCard
              id={exp.id}
              label={exp.label}
              thumbnailUrl={exp.thumbnailUrl}
              durationSeconds={exp.duration_seconds}
              createdAt={exp.created_at}
              videoUrl={exp.videoUrl}
              isDownloading={isDownloading !== null}
              onDownload={handleDownload}
            />
            {/* Actions dropdown */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 bg-black/50 hover:bg-black/70 text-white">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      if (exp.videoUrl) {
                        const filename = `${(exp.label || "export").replace(/\s+/g, "_")}_${new Date(exp.created_at).getTime()}.mp4`;
                        handleDownload(exp.videoUrl, filename);
                      }
                    }}
                    disabled={isDownloading !== null}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(exp.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/components/exports/ExportsPanel.tsx
git commit -m "feat: add ExportsPanel component with download and delete"
```

---

### Task 5: Add Exports Route and Integrate with LeftPanel

**Files:**

- Modify: `app/routes.ts` (add exports route)
- Modify: `app/components/editor/LeftPanel.tsx` (add exports tab)

**Step 1: Add exports route**

In `/app/routes.ts`, add to the leftPanel children array:

```typescript
// Find the leftPanel route and add exports to children
{
  path: "exports",
  lazy: () => import("./routes/exports"),
},
```

**Step 2: Create exports route file**

Create `app/routes/exports.tsx`:

```typescript
import { ExportsPanel } from "~/components/exports/ExportsPanel";
import { useParams } from "react-router";

export default function ExportsRoute() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <div>Project ID required</div>;
  }

  return <ExportsPanel projectId={projectId} />;
}
```

**Step 3: Add exports tab to LeftPanel**

In `/app/components/editor/LeftPanel.tsx`:

1. Add import: `import { Film } from "lucide-react";` (already have lucide-react)
2. Change `grid-cols-4` to `grid-cols-5` in TabsList
3. Add exports tab before media-bin:

```tsx
<TabsTrigger
  value="exports"
  asChild
  className="h-8 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
  <Link to="exports" className="flex items-center gap-1.5" title="Exports">
    <Film className="h-3 w-3" />
  </Link>
</TabsTrigger>
```

4. Add to `getActiveTab()` function:

```typescript
if (location.pathname.includes("/exports")) return "exports";
```

**Step 4: Commit**

```bash
git add app/routes.ts app/routes/exports.tsx app/components/editor/LeftPanel.tsx
git commit -m "feat: add exports route and tab to left panel"
```

---

### Task 6: Update Render Flow - Progress Toast → Download Toast

**Goal:** Replace the current render progress UI with a single persistent toast that shows render progress, then transforms into a download toast when complete.

**Behavior:**

1. **During render:** Toast shows "Rendering: X%" with progress (persistent, no auto-dismiss)
2. **On complete:** Same toast updates to "Render complete! Click to download" with Download button + X dismiss
3. **On error:** Toast shows error message and dismisses
4. When user clicks Download or dismisses toast → trigger exports panel refresh

**Files:**

- Modify: `app/routes/api.render.tsx` (save metadata on completion)
- Modify: `app/hooks/useRenderer.ts` (single morphing toast)
- Modify: `app/routes/home.tsx` (wire up refresh)

**Step 1: Update api.render.tsx to save metadata on completion**

In `/app/routes/api.render.tsx`, when render completes successfully:

```typescript
// After render completes and asset is saved, update export metadata:
await updateExportMetadata(exportId, {
  durationSeconds: Math.round(durationInFrames / fps), // calculate from render output
  label: scenes.length === 1 ? scenes[0].name : "Timeline",
  fileSizeBytes: fileSize, // from render output
});
```

**Step 2: Update useRenderer.ts with morphing toast**

Replace `/app/hooks/useRenderer.ts` completely:

```typescript
import { useState, useCallback, useRef, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import type { TimelineDataItem } from "~/components/timeline/types";

export const useRenderer = (options?: { onRenderComplete?: () => void }) => {
  const [isRendering, setIsRendering] = useState(false);
  const toastIdRef = useRef<string | number | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const showDownloadToast = useCallback(
    (outputFile: string) => {
      // Update existing toast to download state
      toastIdRef.current = toast.success("Render complete! Click to download", {
        id: toastIdRef.current || undefined,
        duration: Infinity,
        action: {
          label: "Download",
          onClick: () => {
            // Fetch as blob to trigger save dialog
            fetch(outputFile)
              .then((res) => res.blob())
              .then((blob) => {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = blobUrl;
                link.download = "rendered-video.mp4";
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(blobUrl);
                toast.dismiss(toastIdRef.current!);
                options?.onRenderComplete?.();
              })
              .catch((err) => {
                console.error("Download failed:", err);
                toast.error("Failed to download video");
              });
          },
        },
        onDismiss: () => {
          options?.onRenderComplete?.();
        },
      });
    },
    [options],
  );

  const startRender = useCallback(
    async (renderPayload: object, label: string) => {
      setIsRendering(true);

      // Show initial progress toast
      toastIdRef.current = toast.loading(`Starting ${label}...`, {
        duration: Infinity,
      });

      try {
        const response = await axios.post("/api/render", renderPayload);
        const { renderId, bucketName } = response.data;

        if (!renderId || !bucketName) {
          throw new Error("Invalid response from render API");
        }

        // Poll progress
        pollIntervalRef.current = setInterval(async () => {
          try {
            const progressRes = await axios.get(`/api/render?renderId=${renderId}&bucketName=${bucketName}`);
            const { done, status, progress: renderProgress, outputFile, errors } = progressRes.data;

            if (!done) {
              // Update toast with progress
              toast.loading(`Rendering: ${Math.round(renderProgress || 0)}%`, {
                id: toastIdRef.current!,
                duration: Infinity,
              });
            } else {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;

              if (status === "completed" && outputFile) {
                showDownloadToast(outputFile);
              } else {
                toast.error(`Error: ${errors?.join(", ") || "Render failed"}`, {
                  id: toastIdRef.current!,
                });
                options?.onRenderComplete?.();
              }
              setIsRendering(false);
            }
          } catch (error) {
            clearInterval(pollIntervalRef.current!);
            pollIntervalRef.current = null;
            toast.error("Error: Failed to check render progress", {
              id: toastIdRef.current!,
            });
            setIsRendering(false);
            options?.onRenderComplete?.();
          }
        }, 2000);
      } catch (error) {
        console.error("Render error:", error);
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : "Unknown rendering error";
        toast.error(`Error: ${message}`, { id: toastIdRef.current! });
        setIsRendering(false);
        options?.onRenderComplete?.();
      }
    },
    [options, showDownloadToast],
  );

  const handleRenderVideo = useCallback(
    async (
      projectId: string,
      scenes: Array<{
        sceneId: string;
        variables: Record<string, string>;
        duration?: number;
      }>,
      compositionWidth: number,
      compositionHeight: number,
      applyElasticity?: boolean,
    ) => {
      const sceneNames = scenes.map((s) => s.sceneId).join(", ");
      const label = scenes.length === 1 ? "scene" : `${scenes.length} scenes`;

      await startRender(
        {
          projectId,
          scenes,
          compositionWidth,
          compositionHeight,
          applyElasticity: applyElasticity !== false,
        },
        label,
      );
    },
    [startRender],
  );

  const handleRenderTimeline = useCallback(
    async (
      timelineData: TimelineDataItem[],
      compositionWidth: number,
      compositionHeight: number,
      durationInFrames: number,
    ) => {
      await startRender(
        {
          timelineData,
          compositionWidth,
          compositionHeight,
          durationInFrames,
        },
        "timeline",
      );
    },
    [startRender],
  );

  return {
    isRendering,
    handleRenderVideo,
    handleRenderTimeline,
  };
};
```

**Step 3: Wire up refresh in home.tsx**

In `/app/routes/home.tsx`:

```typescript
// Add state for refresh key
const [exportsRefreshKey, setExportsRefreshKey] = useState(0);

// Pass callback to useRenderer
const { isRendering, handleRenderVideo, handleRenderTimeline } = useRenderer({
  onRenderComplete: () => setExportsRefreshKey((k) => k + 1),
});
```

Update the Outlet context to include refreshKey:

```typescript
// Find the Outlet context object and add:
exportsRefreshKey,
```

**Step 4: Update exports route to use key prop**

In `app/routes/exports.tsx`:

```typescript
import { ExportsPanel } from "~/components/exports/ExportsPanel";
import { useParams, useOutletContext } from "react-router";

export default function ExportsRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const { exportsRefreshKey } = useOutletContext<{ exportsRefreshKey: number }>();

  if (!projectId) {
    return <div>Project ID required</div>;
  }

  // Key prop triggers full remount when changed, automatically re-fetching data
  return <ExportsPanel key={exportsRefreshKey} projectId={projectId} />;
}
```

**Step 5: Remove refreshKey from ExportsPanel props**

Update `app/components/exports/ExportsPanel.tsx`:

```typescript
interface ExportsPanelProps {
  projectId: string;
  // Remove: refreshKey?: number;  -- no longer needed!
}

export function ExportsPanel({ projectId }: ExportsPanelProps) {
  // ... rest of component stays the same

  useEffect(() => {
    fetchExports();
  }, [fetchExports]); // Remove refreshKey from dependencies

  // ...
}
```

Update the Outlet context to include refreshKey:

```typescript
// Find the Outlet context object and add:
exportsRefreshKey,
```

**Step 4: Update exports route to receive refreshKey**

In `app/routes/exports.tsx`:

```typescript
import { ExportsPanel } from "~/components/exports/ExportsPanel";
import { useParams, useOutletContext } from "react-router";

export default function ExportsRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const { exportsRefreshKey } = useOutletContext<{ exportsRefreshKey: number }>();

  if (!projectId) {
    return <div>Project ID required</div>;
  }

  return <ExportsPanel projectId={projectId} refreshKey={exportsRefreshKey} />;
}
```

**Step 5: Commit**

```bash
git add app/routes/api.render.tsx app/hooks/useRenderer.ts app/routes/home.tsx app/routes/exports.tsx
git commit -m "feat: morphing toast (progress → download) and exports refresh"
```

---

### Task 7: Type Checking and Final Verification

**Step 1: Run type checker**

```bash
pnpm typecheck
```

Expected: No TypeScript errors

**Step 2: Run linter**

```bash
pnpm lint
```

Expected: No lint errors (or fix auto-fixable ones)

**Step 3: Test the workflow manually**

1. Start dev server: `pnpm dev`
2. Open a project in the editor
3. Click Exports tab - should show empty state with instructions
4. Click Export button in header, render a video
5. Should see persistent toast at bottom right
6. Click Download in toast - should open save dialog (not redirect)
7. Exports panel should refresh and show new export
8. Export card should show thumbnail, duration, label, download button
9. Right-click export - should show context menu with Download/Delete
10. Click Delete - should remove export from panel

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete exports panel with non-redirect downloads"
```

---

## Summary

This implementation:

1. Adds database columns for export metadata (thumbnail, duration, label, file size)
2. Creates Exports API route for listing/deleting with asset URL joins
3. Builds ExportCard component with thumbnail, duration, download button
4. Builds ExportsPanel with empty state and dropdown menu (Download/Delete)
5. Adds Exports tab to left panel activity bar
6. Updates render flow with morphing toast: "Rendering: X%" → "Render complete! Click to download"
7. Implements blob download to avoid redirect (opens save dialog)
8. Auto-refreshes exports panel via key prop remount when render completes or toast dismissed

**Toast Behavior:**

- Shows "Rendering: X%" during render (persistent, no auto-dismiss)
- Updates to "Render complete! Click to download" with Download button + X dismiss
- On error: shows error message and dismisses
- Download or dismiss triggers exports panel refresh

All downloads use `fetch(blob) → createObjectURL → <a download>` pattern to trigger native save dialog without leaving the page.
