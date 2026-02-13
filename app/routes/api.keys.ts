import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireUserId } from "~/lib/auth.utils";
import { generateApiKey, listApiKeys, revokeApiKey } from "~/lib/api-keys.server";
import { z } from "zod";

// Helper for JSON errors
function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const keys = await listApiKeys(userId);
  return Response.json({ keys });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);

  if (request.method === "POST") {
    try {
      const body = await request.json();
      const schema = z.object({
        name: z.string().min(1).max(50),
      });
      const { name } = schema.parse(body);

      const result = await generateApiKey(userId, name);
      return Response.json(result, { status: 201 });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return jsonError("Invalid input", 400);
      }
      return jsonError("Failed to create key", 500);
    }
  }

  if (request.method === "DELETE") {
    try {
      const body = await request.json();
      const schema = z.object({
        keyId: z.uuid(),
      });
      const { keyId } = schema.parse(body);

      await revokeApiKey(userId, keyId);
      return new Response(null, { status: 204 });
    } catch (e) {
      return jsonError("Failed to revoke key", 500);
    }
  }

  return jsonError("Method not allowd", 405);
}
