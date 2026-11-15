import { describe, expect, it } from "vitest";

import { formatHours, formatShare } from "./metrics";

describe("growth metrics formatting (WP M.1)", () => {
  it("shows hours as days and hours", () => {
    expect(formatHours(null)).toBe("–");
    expect(formatHours(0.4)).toBe("under 1 h");
    expect(formatHours(5.2)).toBe("5 h");
    expect(formatHours(52)).toBe("2 d 4 h");
    expect(formatHours(48)).toBe("2 d");
  });

  it("shows shares as whole percent, a dash without a denominator", () => {
    expect(formatShare(null)).toBe("–");
    expect(formatShare(0)).toBe("0 %");
    expect(formatShare(0.6667)).toBe("67 %");
    expect(formatShare(1)).toBe("100 %");
  });
});
