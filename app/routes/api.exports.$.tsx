import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUserId } from "~/lib/auth.utils";
import { listUserRenders, deleteFromR2 } from "~/lib/r2-client";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  // Note: Ignore projectId for now (list all user renders).

  try {
    const renders = await listUserRenders(userId);

    const exports = renders.map((render) => {
      // Extract ID from key (filename without .mp4 extension)
      const filename = render.key.split("/").pop() || "";
      const id = filename.replace(/\.mp4$/, "");

      return {
        id,
        label: "Rendered Video",
        thumbnailUrl: null,
        videoUrl: render.url,
        duration_seconds: null,
        file_size_bytes: render.size,
        created_at: render.lastModified.toISOString(),
        render_status: "completed",
      };
    });

    return new Response(JSON.stringify({ exports }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to list exports:", error);
    return new Response(JSON.stringify({ error: "Failed to list exports" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const DeleteExportSchema = z.object({
  exportId: z.string(),
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

    const key = `${userId}/renders/${exportId}.mp4`;
    await deleteFromR2(key);

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
