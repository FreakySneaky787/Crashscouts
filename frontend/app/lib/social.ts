import { brand } from "~/config/brand";

/** The link preview image (1200 x 630, WP 8.9); source: scripts/og-image.html. */
export const SOCIAL_IMAGE = { path: "/og-image.png", width: "1200", height: "630", alt: "" };

/**
 * Open Graph and Twitter card tags for a shareable page (WP 8.9, ADR 0035). `url` is the page's
 * absolute address; the image address is derived from it, so it always points to the same host.
 */
export function socialMeta({ url, title, description }: { url: string; title: string; description: string }) {
  const image = new URL(SOCIAL_IMAGE.path, url).toString();
  return [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: brand.name },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: SOCIAL_IMAGE.width },
    { property: "og:image:height", content: SOCIAL_IMAGE.height },
    { property: "og:image:alt", content: `${brand.name}: ${title}` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}
