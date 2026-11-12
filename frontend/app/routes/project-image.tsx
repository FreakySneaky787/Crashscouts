/**
 * Resource route: streams a project logo or screenshot. The browser's session is forwarded, so
 * Django decides access (private projects: team only). Validated key, safe headers.
 */
import type { Route } from "./+types/project-image";
import { backendFetchBinary } from "~/lib/backend.server";
import { isUuid } from "~/lib/http";

export async function loader({ request, params }: Route.LoaderArgs) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!isUuid(params.key)) return notFound();
  const upstream = await backendFetchBinary(`/api/v1/project-images/${params.key}/`, request);
  if (upstream.status !== 200 || upstream.headers.get("Content-Type") !== "image/webp") {
    await upstream.body?.cancel();
    return notFound();
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Disposition": 'inline; filename="image.webp"',
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      // Django decides: public projects may be cached, private ones never.
      "Cache-Control": upstream.headers.get("Cache-Control") === "public, max-age=3600" ? "public, max-age=3600" : "private, no-store",
      Vary: "Cookie",
    },
  });
}
