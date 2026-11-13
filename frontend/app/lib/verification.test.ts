import { describe, expect, it } from "vitest";

import { verificationErrorKey, verificationOutcome } from "./verification";

describe("verificationErrorKey", () => {
  it("keeps known codes and maps everything else to generic", () => {
    expect(verificationErrorKey("code_mismatch")).toBe("code_mismatch");
    expect(verificationErrorKey("not_maintainer")).toBe("not_maintainer");
    for (const value of [undefined, null, 42, "", "<script>", "constructor", "__proto__"]) {
      expect(verificationErrorKey(value)).toBe("generic");
    }
  });
});

describe("verificationOutcome", () => {
  it("reads the result from the URL", () => {
    expect(verificationOutcome(new URLSearchParams("verification=verified"))).toEqual({ ok: true });
    expect(verificationOutcome(new URLSearchParams("verification_error=cancelled"))).toEqual({ ok: false, error: "cancelled" });
    expect(verificationOutcome(new URLSearchParams("verification_error=whatever"))).toEqual({ ok: false, error: "generic" });
    expect(verificationOutcome(new URLSearchParams("verification=other"))).toBeNull();
    expect(verificationOutcome(new URLSearchParams(""))).toBeNull();
  });
});
