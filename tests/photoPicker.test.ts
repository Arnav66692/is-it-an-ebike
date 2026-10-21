import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("photo pickers work on iPhone", () => {
  // A capture attribute makes iOS open only the camera and hide the photo library, so
  // "Take or choose a photo" must offer both. (source check)
  it("never forces the camera on a file input", () => {
    for (const f of ["components/BikeInput.tsx", "components/PedalPhotoCheck.tsx"]) {
      const src = read(f);
      expect(src, f).toContain('type="file"');
      expect(src, f).not.toMatch(/capture=/);
    }
  });

  // Some iOS Safari versions can't make an ImageBitmap from every photo, so both readers go
  // through the shrinker that falls back to a plain image element. (source check)
  it("shrinks every picked photo through the fallback decoder", () => {
    expect(read("lib/photo/shrink.ts")).toContain("decodeWithImage");
    expect(read("components/BikeInput.tsx")).toContain("shrinkPhoto(");
    expect(read("lib/photo/runPedalCheck.ts")).toContain("shrinkPhoto(");
  });
});
