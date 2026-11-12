/**
 * Security settings: authenticator app (TOTP) and recovery codes (WP 1.3a). Changes need a fresh
 * password confirmation; the backend answers 401 "reauthenticate" and we send the user to
 * /reauthenticate and back. Recovery codes are only shown in an action response (never cached).
 */
import { useTranslation } from "react-i18next";
import { data, Form, redirect } from "react-router";

import type { Route } from "./+types/settings-security";
import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { ArrowsClockwiseIcon, EyeIcon, ShieldCheckIcon, XIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { PageHeader } from "~/components/ui/PageHeader";
import { Panel } from "~/components/ui/Panel";
import { QrCode } from "~/components/ui/QrCode";
import { StatusPill } from "~/components/ui/StatusPill";
import { brand } from "~/config/brand";
import { hasFlow } from "~/lib/auth";
import { AUTH_BASE, backendFetch, ensureCsrfToken, getSessionUser } from "~/lib/backend.server";
import { privateNoStoreHeaders, setCookieHeaders } from "~/lib/http";
import { groupSecret, type Authenticator } from "~/lib/mfa";

import styles from "./forms.module.css";

const SELF = "/settings/security";

export function meta(_: Route.MetaArgs) {
  return [{ title: `Security settings · ${brand.name}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await getSessionUser(request))) {
    throw redirect(`/login?next=${encodeURIComponent(SELF)}`, { headers: privateNoStoreHeaders() });
  }
  const [list, csrf] = await Promise.all([
    backendFetch<{ data?: Authenticator[] }>(request, `${AUTH_BASE}/account/authenticators`),
    ensureCsrfToken(request),
  ]);
  const authenticators = list.data?.data ?? [];
  const totp = authenticators.find((a) => a.type === "totp") ?? null;
  const recovery = authenticators.find((a) => a.type === "recovery_codes") ?? null;

  // Not active yet: allauth hands out a fresh secret for the setup (404 with meta).
  let setup: { secret: string; url: string } | null = null;
  if (!totp) {
    const pending = await backendFetch<{ meta?: { secret?: string; totp_url?: string } }>(
      request,
      `${AUTH_BASE}/account/authenticators/totp`,
    );
    const secret = pending.data?.meta?.secret;
    const url = pending.data?.meta?.totp_url;
    if (secret && url) setup = { secret, url };
  }
  return data(
    { csrfToken: csrf.token, totp, recovery, setup },
    { headers: setCookieHeaders(csrf.setCookies, privateNoStoreHeaders()) },
  );
}

type ActionResult = {
  done?: "activated" | "deactivated" | "regenerated";
  codes?: string[];
  error?: "incorrect" | "forbidden" | "rateLimited" | "generic";
};

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const csrfToken = String(form.get("csrf_token") ?? "");
  const intent = String(form.get("intent") ?? "");
  const path = intent === "activate" || intent === "deactivate" ? "totp" : "recovery-codes";
  const method = intent === "activate" || intent === "regenerate" ? "POST" : intent === "deactivate" ? "DELETE" : "GET";
  const json = intent === "activate" ? { code: String(form.get("code") ?? "").replace(/\s+/g, "") } : undefined;

  const result = await backendFetch<{ data?: { unused_codes?: string[] } }>(request, `${AUTH_BASE}/account/authenticators/${path}`, {
    method,
    csrfToken,
    json: method === "POST" ? (json ?? {}) : undefined,
  });
  const headers = setCookieHeaders(result.setCookies, privateNoStoreHeaders());

  // Sensitive change without a fresh confirmation: confirm the password, then come back.
  if (result.status === 401) {
    const target = hasFlow(result.data, "reauthenticate") ? "/reauthenticate" : "/login";
    throw redirect(`${target}?next=${encodeURIComponent(SELF)}`, { headers });
  }
  if (result.status === 200) {
    const codes = result.data?.data?.unused_codes;
    if (intent === "activate") return data<ActionResult>({ done: "activated" }, { headers });
    if (intent === "deactivate") return data<ActionResult>({ done: "deactivated" }, { headers });
    if (intent === "regenerate") return data<ActionResult>({ done: "regenerated", codes }, { headers });
    return data<ActionResult>({ codes }, { headers });
  }
  const error: ActionResult["error"] =
    result.status === 400 ? "incorrect" : result.status === 403 ? "forbidden" : result.status === 429 ? "rateLimited" : "generic";
  return data<ActionResult>({ error }, { status: result.status === 429 ? 429 : 400, headers });
}

export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return [...actionHeaders].length > 0 ? actionHeaders : loaderHeaders;
}

function Hidden({ csrfToken, intent }: { csrfToken: string; intent: string }) {
  return (
    <>
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}

export default function SettingsSecurity({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { csrfToken, totp, recovery, setup } = loaderData;

  return (
    <div className={styles.stack}>
      <PageHeader title={t("mfa.settingsTitle")} subtitle={t("mfa.settingsIntro")} />

      {actionData?.done ? <Notice tone="ok" title={t(`mfa.done.${actionData.done}`)} /> : null}
      {actionData?.error === "incorrect" ? <Notice tone="danger" title={t("mfa.incorrect")} /> : null}
      {actionData?.error && actionData.error !== "incorrect" ? <Notice tone="danger" title={t(`formError.${actionData.error}`)} /> : null}

      <Panel
        title={t("mfa.appTitle")}
        aside={
          totp ? (
            <StatusPill tone="ok" icon={ShieldCheckIcon} label={t("mfa.on")} />
          ) : (
            <StatusPill tone="neutral" label={t("mfa.off")} />
          )
        }
      >
        {totp ? (
          <div className={styles.stack}>
            <p>{t("mfa.appOnText")}</p>
            <Form method="post">
              <Hidden csrfToken={csrfToken} intent="deactivate" />
              <Button type="submit" icon={XIcon}>
                {t("mfa.turnOff")}
              </Button>
            </Form>
          </div>
        ) : setup ? (
          <div className={styles.stack}>
            <ol className={styles.steps}>
              <li>{t("mfa.step1")}</li>
              <li>
                {t("mfa.step2")}
                <div className={styles.qrRow}>
                  <QrCode value={setup.url} label={t("mfa.qrLabel")} />
                  <div className={styles.stackTight}>
                    <p className={styles.muted}>{t("mfa.manualKey")}</p>
                    <code className={styles.secret} data-testid="totp-secret">
                      {groupSecret(setup.secret)}
                    </code>
                  </div>
                </div>
              </li>
              <li>{t("mfa.step3")}</li>
            </ol>
            <Form method="post" className={styles.form}>
              <Hidden csrfToken={csrfToken} intent="activate" />
              <TextField id="code" name="code" label={t("mfa.code")} autoComplete="one-time-code" inputMode="numeric" required />
              <div>
                <Button type="submit" variant="primary" icon={ShieldCheckIcon}>
                  {t("mfa.turnOn")}
                </Button>
              </div>
            </Form>
          </div>
        ) : (
          <Notice tone="danger" title={t("formError.generic")} />
        )}
      </Panel>

      {recovery ? (
        <Panel title={t("mfa.recoveryTitle")} aside={t("mfa.recoveryLeft", { count: recovery.unused_code_count ?? 0 })}>
          <div className={styles.stack}>
            <p>{t("mfa.recoveryText")}</p>
            {actionData?.codes ? (
              <div className={styles.stackTight}>
                <Notice tone="info" title={t("mfa.recoveryStore")} />
                <ul className={styles.codes} aria-label={t("mfa.recoveryTitle")} data-testid="recovery-codes">
                  {actionData.codes.map((code) => (
                    <li key={code}>
                      <code>{code}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className={styles.buttonRow}>
              <Form method="post">
                <Hidden csrfToken={csrfToken} intent="show-codes" />
                <Button type="submit" icon={EyeIcon}>
                  {t("mfa.showCodes")}
                </Button>
              </Form>
              <Form method="post">
                <Hidden csrfToken={csrfToken} intent="regenerate" />
                <Button type="submit" variant="quiet" icon={ArrowsClockwiseIcon}>
                  {t("mfa.regenerate")}
                </Button>
              </Form>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
