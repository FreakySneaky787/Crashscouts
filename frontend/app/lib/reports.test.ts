import { describe, expect, it } from "vitest";

import { reportHref, reportTarget } from "./reports";

const LINK = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("reportTarget", () => {
  it("reads valid targets and where to go back", () => {
    expect(reportTarget(new URLSearchParams("type=project&project=tidewater"))).toEqual({ type: "project", project: "tidewater", back: "/p/tidewater" });
    expect(reportTarget(new URLSearchParams("type=campaign&project=tidewater&campaign=beta-1"))?.back).toBe("/p/tidewater/c/beta-1");
    expect(reportTarget(new URLSearchParams(`type=link&project=tidewater&campaign=beta-1&link=${LINK}`))?.link).toBe(LINK);
  });

  it("rejects malformed targets", () => {
    for (const query of [
      "",
      "type=project",
      "type=project&project=../etc",
      "type=campaign&project=tidewater",
      "type=link&project=tidewater&campaign=beta-1&link=not-a-uuid",
      "type=user&project=tidewater",
    ]) {
      expect(reportTarget(new URLSearchParams(query))).toBeNull();
    }
  });

  it("round-trips through reportHref", () => {
    const href = reportHref({ type: "link", project: "tidewater", campaign: "beta-1", link: LINK });
    expect(reportTarget(new URL(href, "http://x").searchParams)?.type).toBe("link");
  });
});
