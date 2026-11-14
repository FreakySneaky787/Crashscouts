import { afterEach, describe, expect, it, vi } from "vitest";

import { backendFetch } from "./backend.server";

function captureHeaders(): { headers: () => Headers } {
  let captured = new Headers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: URL, init: RequestInit) => {
      captured = new Headers(init.headers);
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    }),
  );
  return { headers: () => captured };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backendFetch", () => {
  it("passes the reverse proxy's X-Forwarded-For on unchanged", async () => {
    const sent = captureHeaders();
    const request = new Request("https://example.test/projects", {
      headers: { "X-Forwarded-For": "203.0.113.57" },
    });
    await backendFetch(request, "/api/v1/me/");
    expect(sent.headers().get("X-Forwarded-For")).toBe("203.0.113.57");
    expect(sent.headers().get("X-Forwarded-Host")).toBe("example.test");
  });

  it("adds no X-Forwarded-For of its own", async () => {
    const sent = captureHeaders();
    await backendFetch(new Request("https://example.test/"), "/api/v1/me/");
    expect(sent.headers().has("X-Forwarded-For")).toBe(false);
  });
});

describe("refused writes of suspended accounts (WP 7.2)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function answer(status: number, body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
    );
  }

  it("lead to the explanation on the account page", async () => {
    answer(403, { code: "account_suspended" });
    const thrown = await backendFetch(new Request("http://localhost/x"), "/api/v1/reports/", { method: "POST", json: {} }).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/account?suspended=1");
  });

  it("leave other answers and reading alone", async () => {
    answer(403, { code: "account_suspended" });
    expect((await backendFetch(new Request("http://localhost/x"), "/api/v1/me/")).status).toBe(403);
    answer(403, { detail: "forbidden" });
    expect((await backendFetch(new Request("http://localhost/x"), "/api/v1/reports/", { method: "POST", json: {} })).status).toBe(403);
  });
});
