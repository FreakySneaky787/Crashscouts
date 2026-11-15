/**
 * The public scheme of a request (question P, WP 8.6, ADR 0032). Behind the reverse proxy the SSR
 * server receives plain HTTP; Caddy tells it the browser's scheme in `X-Forwarded-Proto` and
 * overwrites any value a client sent. That header is trusted only when the deployment says so
 * (`TRUST_PROXY_HEADERS=true`, set in compose.prod.yaml, where the SSR server is reachable only
 * through Caddy); otherwise the request URL decides.
 */
type Env = Record<string, string | undefined>;

export function publicProtocol(request: Request, env: Env = process.env): "http" | "https" {
  if (env.TRUST_PROXY_HEADERS === "true") {
    const forwarded = request.headers.get("X-Forwarded-Proto")?.split(",")[0]?.trim().toLowerCase();
    if (forwarded === "https" || forwarded === "http") return forwarded;
  }
  return new URL(request.url).protocol === "https:" ? "https" : "http";
}
