import { mapResponse } from "@/lib/map/overpassServer";

// This route runs on the default Node.js runtime. With cacheComponents on, Next.js does not allow
// a runtime export here, so there is none.

/** Four servers at 12 seconds each, plus a little room. */
export const maxDuration = 60;

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, number[]>();

/** Best-effort limit per address. It resets when the server instance restarts. CDN hits never count. */
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function GET(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return Response.json({ error: "limited" }, { status: 429, headers: { "cache-control": "no-store" } });
  return mapResponse(new URL(request.url));
}
