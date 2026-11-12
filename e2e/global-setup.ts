import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Migrates the database and creates test data via the test-only command `ssr_probe_seed`.
 * Passwords are generated randomly per run and only passed on via environment variables.
 */
export default function globalSetup(): void {
  const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../backend");
  const env = {
    ...process.env,
    PROBE_OWNER_PASSWORD: randomBytes(18).toString("base64url"),
    PROBE_STRANGER_PASSWORD: randomBytes(18).toString("base64url"),
  };

  const manage = (...args: string[]) =>
    execFileSync("uv", ["run", "--env-file", "../.env", "python", "manage.py", ...args], {
      cwd: backendDir,
      env,
      encoding: "utf-8",
    });

  manage("migrate", "--noinput");
  const output = manage("ssr_probe_seed").trim().split("\n").pop() ?? "";
  const ids = JSON.parse(output) as { public_id: string; private_id: string };

  // Workers inherit process.env from the global setup.
  process.env.PROBE_OWNER_PASSWORD = env.PROBE_OWNER_PASSWORD;
  process.env.PROBE_STRANGER_PASSWORD = env.PROBE_STRANGER_PASSWORD;
  process.env.PROBE_PUBLIC_ID = ids.public_id;
  process.env.PROBE_PRIVATE_ID = ids.private_id;
}
