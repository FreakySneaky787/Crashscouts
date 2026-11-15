import { describe, expect, it } from "vitest";

import { publicProtocol } from "./proxy.server";

const behindProxy = (proto?: string) =>
  new Request("http://crashscouts.example/", { headers: proto === undefined ? {} : { "X-Forwarded-Proto": proto } });

describe("public scheme behind the reverse proxy (question P)", () => {
  it("trusts X-Forwarded-Proto only when the deployment says so", () => {
    expect(publicProtocol(behindProxy("https"), { TRUST_PROXY_HEADERS: "true" })).toBe("https");
    expect(publicProtocol(behindProxy("https"), {})).toBe("http"); // development: never trusted
    expect(publicProtocol(behindProxy("https"), { TRUST_PROXY_HEADERS: "1" })).toBe("http");
  });

  it("falls back to the request URL for missing or odd values", () => {
    expect(publicProtocol(behindProxy(), { TRUST_PROXY_HEADERS: "true" })).toBe("http");
    expect(publicProtocol(behindProxy("gopher"), { TRUST_PROXY_HEADERS: "true" })).toBe("http");
    expect(publicProtocol(new Request("https://x.example/"), {})).toBe("https");
    expect(publicProtocol(behindProxy("HTTPS, http"), { TRUST_PROXY_HEADERS: "true" })).toBe("https");
  });
});
