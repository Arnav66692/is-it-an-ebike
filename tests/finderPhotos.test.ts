import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BikePhoto } from "@/components/BikeFinder";
import { CATALOG } from "@/lib/bikes/catalog";
import { photoFor, storeName } from "@/lib/bikes/photos";
import { finderText } from "@/lib/i18n/finder";

describe("finder photos and buy links", () => {
  it("gives every catalog bike an https photo from its maker", () => {
    for (const bike of CATALOG) {
      const url = photoFor(bike.id);
      expect(url, bike.id).not.toBeNull();
      expect(url!.startsWith("https://"), bike.id).toBe(true);
    }
  });

  it("loads no photo until the drawer is opened", () => {
    const html = renderToStaticMarkup(createElement(BikePhoto, { bike: CATALOG[0], lang: "en" }));
    expect(html).toContain("<details");
    expect(html).toContain(finderText("en", "photo"));
    expect(html).not.toContain("<img");
  });

  it("names the maker's store on the buy link, in both languages", () => {
    expect(storeName("https://www.aventon.com/products/abound-lr-ebike")).toBe("aventon.com");
    expect(finderText("en", "makerPage", { site: "aventon.com" })).toBe("Buy on aventon.com");
    expect(finderText("es", "makerPage", { site: "aventon.com" })).toBe("Comprar en aventon.com");
    const source = readFileSync(join(process.cwd(), "components/BikeFinder.tsx"), "utf8");
    expect(source).toContain('href={bike.maker_url} target="_blank" rel="noopener noreferrer"');
  });

  it("keeps the new words in plain style", () => {
    for (const lang of ["en", "es"] as const) {
      for (const key of ["photo", "photoAlt", "makerPage", "about4"] as const) expect(finderText(lang, key), `${lang}.${key}`).not.toMatch(/[—;]/);
    }
  });
});
