import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { Button } from "~/components/ui/Button";
import { GithubLogoIcon } from "~/components/ui/icons";

/**
 * Starts the GitHub flow with a plain form POST (no JavaScript needed). `reloadDocument`: the
 * answer is a redirect to github.com, which must be a full page navigation.
 */
export function GitHubButton({ csrfToken, process = "login" }: { csrfToken: string; process?: "login" | "connect" }) {
  const { t } = useTranslation();
  return (
    <Form method="post" action="/auth/github" reloadDocument>
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="process" value={process} />
      <Button type="submit" icon={GithubLogoIcon}>
        {process === "connect" ? t("github.connect") : t("github.continue")}
      </Button>
    </Form>
  );
}
