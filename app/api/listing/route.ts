import { fetchListing, ListingError } from "@/lib/extract/fetchListing";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

/** Best-effort limit per address. It resets when the server instance restarts. */
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return reply(429, { ok: false, error: "limited" });

  let url: unknown;
  try {
    url = ((await request.json()) as { url?: unknown }).url;
  } catch {
    return reply(400, { ok: false, error: "invalid" });
  }
  if (typeof url !== "string") return reply(400, { ok: false, error: "invalid" });

  try {
    const listing = await fetchListing(url);
    return reply(200, { ok: true, ...listing });
  } catch (err) {
    const code = err instanceof ListingError ? err.code : "failed";
    const status = code === "invalid" ? 400 : code === "blocked" ? 403 : 502;
    return reply(status, { ok: false, error: code });
  }
}
