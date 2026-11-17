import { describe, expect, it } from "vitest";

import { socialMeta } from "./social";

describe("socialMeta", () => {
  it("points the preview image to the page's own host", () => {
    const tags = socialMeta({ url: "https://example.org/p/demo", title: "Demo", description: "A demo." });
    const image = tags.find((t) => "property" in t && t.property === "og:image");
    expect(image?.content).toBe("https://example.org/og-image.png");
    expect(tags).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
    expect(tags).toContainEqual({ property: "og:url", content: "https://example.org/p/demo" });
  });
});
