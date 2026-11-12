/**
 * Resource route: streams an avatar from Django to the browser (same origin, so the CSP's
 * img-src 'self' applies and no backend URL is exposed). Only public avatars exist; Django
 * decides visibility. Validated key, safe headers, no cookies forwarded.
 */
import type { Route } from "./+types/avatar";
import { backendFetchBinary } from "~/lib/backend.server";
import { isUuid } from "~/lib/http";

export async function loader({ params }: Route.LoaderArgs) {
  if (!isUuid(params.key)) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const upstream = await backendFetchBinary(`/api/v1/avatars/${params.key}/`);
  if (upstream.status !== 200 || upstream.headers.get("Content-Type") !== "image/webp") {
    await upstream.body?.cancel();
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Disposition": 'inline; filename="avatar.webp"',
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
