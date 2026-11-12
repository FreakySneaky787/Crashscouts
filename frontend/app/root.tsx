import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import {
  data,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useFetchers,
  useRouteLoaderData,
} from "react-router";

// Self-hosted fonts (SIL OFL 1.1) – no requests to third-party font services.
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/tokens.css";
import "./styles/base.css";

import type { Route } from "./+types/root";
import { AppShell, type ShellUser } from "./components/layout/AppShell";
import { EmptyState } from "./components/ui/EmptyState";
import { brand } from "./config/brand";
import { createI18n, defaultLanguage } from "./i18n";
import { getSessionUser } from "./lib/backend.server";
import { hasSessionCookie } from "./lib/http";
import { isTheme, themeAttribute, themeFromCookieHeader, type Theme } from "./lib/theme";

export const links: Route.LinksFunction = () => [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }];

export async function loader({ request }: Route.LoaderArgs) {
  const theme = themeFromCookieHeader(request.headers.get("Cookie"));
  // Only ask Django when a session cookie exists: anonymous public pages stay backend-free and cacheable.
  const user: ShellUser = hasSessionCookie(request) ? await getSessionUser(request) : null;
  return data({ theme, user });
}

/** Current theme including a pending (optimistic) change from the theme switch. */
function useTheme(): Theme {
  const rootData = useRouteLoaderData<typeof loader>("root");
  const pending = useFetchers().find((f) => f.formAction === "/theme" && f.formData)?.formData?.get("theme");
  return isTheme(pending) ? pending : (rootData?.theme ?? "system");
}

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <html lang={defaultLanguage} data-theme={themeAttribute(theme)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  // One i18n instance per render tree, i.e. per request on the server.
  const [i18n] = useState(() => createI18n());
  const theme = useTheme();
  return (
    <I18nextProvider i18n={i18n}>
      <AppShell user={loaderData.user} theme={theme}>
        <Outlet />
      </AppShell>
    </I18nextProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const [i18n] = useState(() => createI18n());
  const theme = useTheme();
  const rootData = useRouteLoaderData<typeof loader>("root");
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const title = i18n.t(notFound ? "error.notFoundTitle" : "error.genericTitle");
  const message = i18n.t(notFound ? "error.notFound" : "error.generic");
  // Technical details (stack trace) only in the dev server, never in the production build.
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <I18nextProvider i18n={i18n}>
      <title>{`${title} · ${brand.name}`}</title>
      <meta name="robots" content="noindex" />
      <AppShell user={rootData?.user ?? null} theme={theme}>
        <h1 className="visually-hidden">{title}</h1>
        <EmptyState kind={notFound ? "empty" : "error"} title={title}>
          {message}
        </EmptyState>
        {stack ? (
          <pre>
            <code>{stack}</code>
          </pre>
        ) : null}
      </AppShell>
    </I18nextProvider>
  );
}
