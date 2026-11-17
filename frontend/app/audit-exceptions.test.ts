// Every ignored dependency advisory needs a reason and an end date (docs/SECURITY.md §10).
// After the end date this test fails until the advisory is fixed or the exception is decided again.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const EXCEPTIONS: Record<string, { until: string; reason: string }> = {
  // picomatch <= 4.0.7, ReDoS through attacker-supplied glob patterns; no fixed release yet.
  // Only in build and test tools (Vite, Vitest, ESLint), not in the production image; our glob
  // patterns are fixed. Owner's decision 2026-11-17; 14 days for "high".
  "GHSA-fc5q-39xc-vjpf": {
    until: "2026-12-01",
    reason: "dev-only, no fix released",
  },
};

const ignored: string[] =
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).pnpm
    ?.auditConfig?.ignoreGhsas ?? [];

describe("audit exceptions", () => {
  it("every ignored advisory is documented here", () => {
    expect([...ignored].sort()).toEqual(Object.keys(EXCEPTIONS).sort());
  });

  it.each(Object.entries(EXCEPTIONS))(
    "%s is still within its end date",
    (_id, { until }) => {
      expect(new Date().toISOString().slice(0, 10) <= until).toBe(true);
    },
  );
});
