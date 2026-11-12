import { describe, expect, it } from "vitest";

import { fieldErrorCodes, isFlowPending, isPlausibleKey } from "./auth";

describe("fieldErrorCodes", () => {
  it("maps the first known code per field", () => {
    const body = {
      status: 400,
      errors: [
        { code: "password_too_short", param: "password", message: "This password is too short." },
        { code: "password_too_common", param: "password", message: "too common" },
        { code: "username_taken", param: "username" },
      ],
    };
    expect(fieldErrorCodes(body)).toEqual({ password: "password_too_short", username: "username_taken" });
  });

  it("hides unknown codes behind 'other' and collects field-less errors under 'form'", () => {
    const body = { errors: [{ code: "something_new", param: "email" }, { code: "invalid" }] };
    expect(fieldErrorCodes(body)).toEqual({ email: "other", form: "invalid" });
  });

  it("tolerates malformed bodies", () => {
    expect(fieldErrorCodes(null)).toEqual({});
    expect(fieldErrorCodes({ errors: "nope" })).toEqual({});
    expect(fieldErrorCodes("text")).toEqual({});
  });
});

describe("isFlowPending", () => {
  it("detects a pending flow", () => {
    const body = { status: 401, data: { flows: [{ id: "login" }, { id: "verify_email", is_pending: true }] } };
    expect(isFlowPending(body, "verify_email")).toBe(true);
    expect(isFlowPending(body, "login")).toBe(false);
  });

  it("is false for other shapes", () => {
    expect(isFlowPending({}, "verify_email")).toBe(false);
    expect(isFlowPending(null, "verify_email")).toBe(false);
  });
});

describe("isPlausibleKey", () => {
  it("accepts allauth-style keys", () => {
    expect(isPlausibleKey("MQ:1xRWKd:0a6ROqQPqLoy9vwF-aMJMbo1a9L5v5CV_dUpIEVCmAs")).toBe(true);
    expect(isPlausibleKey("abc-def_123")).toBe(true);
  });

  it("rejects empty, oversized or odd input", () => {
    expect(isPlausibleKey(undefined)).toBe(false);
    expect(isPlausibleKey("")).toBe(false);
    expect(isPlausibleKey("a".repeat(513))).toBe(false);
    expect(isPlausibleKey("../../etc/passwd")).toBe(false);
    expect(isPlausibleKey("key\r\nX-Injected: 1")).toBe(false);
  });
});
