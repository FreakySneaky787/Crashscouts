import { useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { brand } from "./config/brand";
import { createI18n, defaultLanguage } from "./i18n";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={defaultLanguage}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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

function Navigation() {
  const { t } = useTranslation();
  return (
    <header>
      <strong>{brand.name}</strong>
      <nav aria-label="Main">
        <Link to="/">{t("nav.home")}</Link> · <Link to="/account">{t("nav.account")}</Link> ·{" "}
        <Link to="/login">{t("nav.login")}</Link>
      </nav>
    </header>
  );
}

export default function App() {
  // One i18n instance per render tree, i.e. per request on the server.
  const [i18n] = useState(() => createI18n());
  return (
    <I18nextProvider i18n={i18n}>
      <Navigation />
      <main>
        <Outlet />
      </main>
    </I18nextProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const [i18n] = useState(() => createI18n());
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const title = i18n.t(notFound ? "error.notFoundTitle" : "error.genericTitle");
  const message = i18n.t(notFound ? "error.notFound" : "error.generic");
  // Technical details (stack trace) only in the dev server, never in the production build.
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <main>
      <title>{`${title} · ${brand.name}`}</title>
      <meta name="robots" content="noindex" />
      <h1>{title}</h1>
      <p>{message}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
