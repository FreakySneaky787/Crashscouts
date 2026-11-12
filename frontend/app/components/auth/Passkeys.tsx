/**
 * Passkey controls (WP 1.3b). WebAuthn needs JavaScript, so these render only after hydration;
 * without JavaScript a short note explains it. Errors are shown as Notices (role="alert").
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";

import { Button } from "~/components/ui/Button";
import { TextField } from "~/components/ui/Form";
import { FingerprintIcon, PlusIcon } from "~/components/ui/icons";
import { Notice } from "~/components/ui/Notice";
import { passkeysSupported, registerPasskey, signInWithPasskey, type PasskeyResult } from "~/lib/passkeys";
import { useHydrated } from "~/lib/use-hydrated";

import styles from "./Passkeys.module.css";

function ErrorNotice({ error }: { error: PasskeyResult["error"] }) {
  const { t } = useTranslation();
  if (!error) return null;
  return <Notice tone="danger" title={t(`passkeys.error.${error}`)} />;
}

/** "Sign in with a passkey": passwordless login, or passkey as second factor ("2fa"). */
export function PasskeySignIn({ csrfToken, next, mode }: { csrfToken: string; next: string; mode: "login" | "2fa" }) {
  const { t } = useTranslation();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PasskeyResult["error"]>();
  if (!hydrated) return <p className={styles.note}>{t("passkeys.needsJs")}</p>;
  if (!passkeysSupported()) return <p className={styles.note}>{t("passkeys.error.unsupported")}</p>;

  async function run() {
    setBusy(true);
    setError(undefined);
    const result = await signInWithPasskey(csrfToken, mode, next);
    if (result.ok && result.next) {
      // Full navigation: the shell (signed-in state) is rendered fresh by the server.
      window.location.assign(result.next);
      return;
    }
    setError(result.error ?? "failed");
    setBusy(false);
  }

  return (
    <div className={styles.stack}>
      <ErrorNotice error={error} />
      <div>
        <Button type="button" icon={FingerprintIcon} onClick={run} disabled={busy}>
          {mode === "login" ? t("passkeys.signIn") : t("passkeys.useAsSecond")}
        </Button>
      </div>
    </div>
  );
}

/** Add a passkey on the security settings page. */
export function PasskeyRegister({ csrfToken }: { csrfToken: string }) {
  const { t } = useTranslation();
  const hydrated = useHydrated();
  const revalidator = useRevalidator();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PasskeyResult>();
  if (!hydrated) return <p className={styles.note}>{t("passkeys.needsJs")}</p>;
  if (!passkeysSupported()) return <p className={styles.note}>{t("passkeys.error.unsupported")}</p>;

  async function run() {
    setBusy(true);
    setResult(undefined);
    const outcome = await registerPasskey(csrfToken, name.trim() || t("passkeys.defaultName"));
    if (!outcome.ok && outcome.next) {
      // A fresh password confirmation is needed first.
      window.location.assign(outcome.next);
      return;
    }
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) {
      setName("");
      void revalidator.revalidate();
    }
  }

  return (
    <div className={styles.stack}>
      {result?.ok ? <Notice tone="ok" title={t("passkeys.added")} /> : <ErrorNotice error={result?.error} />}
      <TextField
        id="passkey-name"
        label={t("passkeys.name")}
        hint={t("passkeys.nameHint")}
        value={name}
        maxLength={100}
        onChange={(event) => setName(event.target.value)}
      />
      <div>
        <Button type="button" icon={PlusIcon} onClick={run} disabled={busy}>
          {t("passkeys.add")}
        </Button>
      </div>
    </div>
  );
}
