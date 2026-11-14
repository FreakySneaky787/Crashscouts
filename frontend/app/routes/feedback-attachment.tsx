/**
 * Resource route: streams a feedback attachment (WP 5.3, ADR 0024). The browser's session is
 * forwarded, so Django decides access (the team and the author only). Images are shown inline in
 * a sandbox; text files are only ever downloads. Never cached.
 */
import type { Route } from "./+types/feedback-attachment";
import { backendFetchBinary } from "~/lib/backend.server";
import { isUuid } from "~/lib/http";

const SAFE_DISPOSITION = /^(inline|attachment); filename="[A-Za-z0-9._ -]{1,100}"$/;

export async function loader({ request, params }: Route.LoaderArgs) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!isUuid(params.key)) return notFound();
  const upstream = await backendFetchBinary(`/api/v1/feedback-attachments/${params.key}/`, request);
  const type = upstream.headers.get("Content-Type");
  const disposition = upstream.headers.get("Content-Disposition") ?? "";
  const image = type === "image/webp" && disposition.startsWith("inline;");
  const text = type === "text/plain; charset=utf-8" && disposition.startsWith("attachment;");
  if (upstream.status !== 200 || !(image || text) || !SAFE_DISPOSITION.test(disposition)) {
    await upstream.body?.cancel();
    return notFound();
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": image ? "image/webp" : "text/plain; charset=utf-8",
      "Content-Disposition": disposition,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}
