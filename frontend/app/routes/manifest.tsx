import { brand } from "~/config/brand";

/** Web app manifest (WP 8.9): built from the central brand settings, never hard-coded. */
export function loader() {
  return Response.json(
    {
      name: brand.name,
      short_name: brand.name,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: "#0e6767",
      background_color: "#f5f6f6",
      display: "browser",
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" } },
  );
}
