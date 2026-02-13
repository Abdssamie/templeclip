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
