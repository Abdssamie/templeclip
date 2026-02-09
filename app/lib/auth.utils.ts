import { auth } from "~/lib/auth.server";

/**
 * Extracts and validates the user ID from the request session.
 * Throws a 401 Response if the user is not authenticated.
 */
export async function requireUserId(request: Request): Promise<string> {
  try {
    const session = await auth.api?.getSession?.({ headers: request.headers });
    const uid: string | undefined = session?.user?.id || session?.session?.userId;
    if (uid) return String(uid);
  } catch (error) {
    console.error("Failed to get session:", error);
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
