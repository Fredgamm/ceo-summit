import { describe, expect, it } from "vitest";

import { hashMeetingToken, newMeetingDecisionToken } from "./meeting-token";

describe("meeting decision token (RG-15)", () => {
  it("is long, random and URL-safe", () => {
    const a = newMeetingDecisionToken().token;
    const b = newMeetingDecisionToken().token;

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 256 bits en base64url
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("only its hash is meant to be stored: SHA-256, never the token itself", () => {
    const { token, hash } = newMeetingDecisionToken();

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashMeetingToken(token)).toBe(hash);
    expect(hashMeetingToken(token + "x")).not.toBe(hash);
  });
});
