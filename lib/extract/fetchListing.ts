// Server-only. Fetches one public product page and returns its text for the parser.
// It refuses private and internal addresses at every redirect hop, caps size and time,
// and stores nothing.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ListingErrorCode = "invalid" | "blocked" | "failed" | "too_big";

export class ListingError extends Error {
  constructor(public code: ListingErrorCode) {
    super(code);
  }
}

export interface Listing {
  title: string;
  text: string;
  source: "shopify" | "html";
}

const MAX_BYTES = 2_000_000;
const MAX_TEXT = 40_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "IsItAnEbike/0.1 (student project that reads public e-bike specs)";

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (isIP(ip) !== 6) return true;
  const x = ip.toLowerCase();
  // IPv4 inside IPv6, in either the dotted or the hex form, gets checked as IPv4 or refused.
  if (x.startsWith("::ffff:")) {
    const tail = x.slice(7);
    return isIP(tail) === 4 ? isPrivateIp(tail) : true;
  }
  // Only ordinary global IPv6 is allowed. Teredo, 6to4 and NAT64 can reach IPv4 inside a network.
  if (!/^[23]/.test(x)) return true;
  return x.startsWith("2001:0:") || x.startsWith("2001::") || x.startsWith("2002:") || x.startsWith("64:ff9b");
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ListingError("invalid");
  if (url.username || url.password) throw new ListingError("invalid");
  if (url.port && url.port !== "80" && url.port !== "443") throw new ListingError("invalid");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(host)) throw new ListingError("invalid");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) throw new ListingError("invalid");
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new ListingError("too_big");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function safeFetch(start: URL, accept: string): Promise<{ status: number; body: string; contentType: string }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new ListingError("failed");
      url = new URL(next, url);
      continue;
    }
    return { status: res.status, body: await readCapped(res), contentType: res.headers.get("content-type") ?? "" };
  }
  throw new ListingError("failed");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", deg: "°" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      // Menus and footers list other products, which would pollute the specs.
      .replace(/<(header|nav|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/li|\/tr|\/h[1-6]|\/div|\/td|\/th|\/dt|\/dd)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function jsonLdDescriptions(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data: unknown = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          if (typeof rec.name === "string") out.push(rec.name);
          if (typeof rec.description === "string") out.push(htmlToText(rec.description));
        }
      }
    } catch {
      // Bad JSON-LD on a store page is common. Skip it.
    }
  }
  return out;
}

interface ShopifyProduct {
  title?: string;
  product_type?: string;
  vendor?: string;
  tags?: string | string[];
  body_html?: string;
  variants?: { title?: string }[];
  options?: { name?: string; values?: string[] }[];
}

function shopifyText(p: ShopifyProduct): string {
  const tags = Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags ?? "");
  const variants = (p.variants ?? []).map((v) => v.title ?? "").filter(Boolean).join(". ");
  const options = (p.options ?? []).map((o) => `${o.name ?? ""}: ${(o.values ?? []).join(", ")}`).join(". ");
  return [p.title, p.product_type, p.vendor, tags, htmlToText(p.body_html ?? ""), options, variants]
    .filter((s) => s && s.trim().length > 0)
    .join("\n");
}

export function parseUserUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) throw new ListingError("invalid");
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ListingError("invalid");
  }
}

async function shopifyProduct(url: URL, handle: string): Promise<ShopifyProduct | null> {
  try {
    const json = await safeFetch(new URL(`/products/${handle}.json`, url.origin), "application/json");
    if (json.status !== 200 || !json.contentType.includes("json")) return null;
    return (JSON.parse(json.body) as { product?: ShopifyProduct }).product ?? null;
  } catch (err) {
    if (err instanceof ListingError && err.code === "invalid") throw err;
    // Not a Shopify store, or the JSON is blocked. The page itself still works.
    return null;
  }
}

export async function fetchListing(raw: string): Promise<Listing> {
  const url = parseUserUrl(raw);
  const handle = /\/products\/([^/?#]+)/.exec(url.pathname)?.[1];
  const product = handle ? await shopifyProduct(url, handle) : null;
  const productText = product ? shopifyText(product) : "";

  let pageText = "";
  let title = product?.title ?? "";
  try {
    const page = await safeFetch(url, "text/html,application/xhtml+xml");
    if (page.status === 200) {
      const pageTitle = htmlToText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.body)?.[1] ?? "");
      const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(page.body)?.[1] ?? "";
      title = title || pageTitle;
      pageText = [pageTitle, decodeEntities(meta), ...jsonLdDescriptions(page.body), htmlToText(page.body)].join("\n");
    } else if (!product) {
      throw new ListingError(page.status === 401 || page.status === 403 || page.status === 429 ? "blocked" : "failed");
    }
  } catch (err) {
    if (!product) throw err;
    // The product JSON already gave us text, so a blocked page isn't fatal.
  }
  // Product data first, so the top of the text describes this bike and not the store's menu.
  const text = [productText, pageText].filter(Boolean).join("\n");
  return { title, text: text.slice(0, MAX_TEXT), source: product ? "shopify" : "html" };
}
