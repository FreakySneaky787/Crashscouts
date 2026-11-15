// Based on React Router 8's default entry.server.tsx (`react-router reveal entry.server`).
// Added: nonce-based CSP (production build only), security headers and safe cache defaults.
import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";

import type { EntryContext, RouterContextProvider } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";

import { missingOperatorSettings } from "./lib/legal";

export const streamTimeout = 5_000;

// A public deployment must name its operator (privacy policy and imprint, WP 8.5): the server
// refuses to start without these settings, like Django refuses a missing secret key.
if (process.env.PUBLIC_DEPLOYMENT === "true") {
  const missing = missingOperatorSettings(process.env);
  if (missing.length) throw new Error(`Missing settings for a public deployment: ${missing.join(", ")}`);
}

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    // GitHub login: the form POST to /auth/github ends in a redirect to GitHub's authorization
    // page, which browsers check against form-action. Only GitHub's origin is added.
    "form-action 'self' https://github.com",
  ].join("; ");
}

function applySecurityHeaders(headers: Headers, nonce: string): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // The dev server (Vite/HMR) needs inline scripts, so the CSP applies to the production build.
  if (import.meta.env.PROD) {
    headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
    // ASVS 5.0 V3.4.1: HSTS on every response, one year (like Django's production settings).
    // Browsers ignore it over plain HTTP; includeSubDomains/preload follow the domain (question N).
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  // Safe default: anything a route does not explicitly mark as cacheable is never stored.
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, no-store");
  }
  if (!headers.has("Vary")) {
    headers.set("Vary", "Cookie");
  }
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: RouterContextProvider,
) {
  const nonce = randomBytes(16).toString("base64");
  applySecurityHeaders(responseHeaders, nonce);

  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    // Bots and SPA mode wait for the complete content.
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html; charset=utf-8");

          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );
  });
}
