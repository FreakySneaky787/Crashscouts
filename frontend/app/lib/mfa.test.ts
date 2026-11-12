import { describe, expect, it } from "vitest";

import { groupSecret } from "./mfa";

describe("groupSecret", () => {
  it("groups the key in blocks of four", () => {
    expect(groupSecret("3RAZJLCUTYI6V6YWWI3GCUAIKYXPSOLY")).toBe("3RAZ JLCU TYI6 V6YW WI3G CUAI KYXP SOLY");
    expect(groupSecret("ABCDEF")).toBe("ABCD EF");
    expect(groupSecret("")).toBe("");
  });
});
