import { routeResponse } from "@/lib/route/plan";

// This route runs on the default Node.js runtime. With cacheComponents on, Next.js does not allow
// a runtime export here, so there is none.
//
// The body is a start, an end and optional places to avoid. Nothing about the rider is sent, and
// nothing about the trip is logged or stored, because the points are a family's home and school.

/** The router, then the edges and heights one at a time, with the Census and the tag lookup running beside them. A busy router can queue calls for several seconds. */
export const maxDuration = 60;

const WINDOW_MS = 10 * 60 * 1000;
/** A route costs a few calls to public servers, so this is lower than the map's limit. */
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

/** The body is two points and a few options, so anything this big is not from the page. */
const MAX_BODY_CHARS = 8_000;

/** Best-effort limit per address. It resets when the server instance restarts. CDN hits never count. */
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

/** The JSON in the body, or null when it is missing, too big or not JSON. The route then answers 400. */
async function readBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.length > MAX_BODY_CHARS ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return Response.json({ error: "rate" }, { status: 429, headers: { "cache-control": "no-store" } });
  return routeResponse(await readBody(request));
}
