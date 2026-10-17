// The listing route must never fetch private or internal addresses.

import { describe, expect, it } from "vitest";
import { fetchListing, htmlToText, ListingError, parseUserUrl } from "@/lib/extract/fetchListing";

async function code(url: string): Promise<string> {
  try {
    await fetchListing(url);
    return "fetched";
  } catch (err) {
    return err instanceof ListingError ? err.code : "other";
  }
}

describe("listing fetch guard", () => {
  it("refuses local, private and odd-port addresses before any request", async () => {
    for (const url of [
      "http://127.0.0.1/products/x",
      "http://2130706433/",
      "http://localhost/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[::ffff:7f00:1]/",
      "http://example.com:9001/",
      "ftp://example.com/",
      "http://user:pass@example.com/",
      "http://printer.local/",
    ]) {
      expect(await code(url), url).toBe("invalid");
    }
  });

  it("adds https when the scheme is missing and rejects junk", () => {
    expect(parseUserUrl("radpowerbikes.com/products/x").href).toBe("https://radpowerbikes.com/products/x");
    expect(() => parseUserUrl("not a url at all")).toThrow(ListingError);
    expect(() => parseUserUrl("")).toThrow(ListingError);
  });

  it("drops scripts, menus and footers from page text", () => {
    const text = htmlToText(
      "<header>Class 3 bikes</header><nav>Tricycle</nav><main><h1>Model X</h1><p>750W&nbsp;motor</p></main><script>var a=1</script><footer>Shop</footer>",
    );
    expect(text).toContain("Model X");
    expect(text).toContain("750W motor");
    expect(text).not.toMatch(/Class 3|Tricycle|var a|Shop/);
  });
});
