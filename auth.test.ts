import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })),
}));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn((c: unknown) => c) }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/plan-access", () => ({
  getViewerTierFromCompany: vi.fn(() => "MEMBER"),
  VIEWER_TIER_INCLUDE: {},
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeCredentials } from "./auth";

const CREDENTIALS = { email: "JP@example.mg", password: "Password1" };
const request = new Request("https://ceo-summit.test/api/auth/callback/credentials", {
  headers: { "x-real-ip": "203.0.113.7" },
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    email: "jp@example.mg",
    name: "Jean-Pierre Rakoto",
    avatarUrl: null,
    role: "MEMBER",
    isPlatformAdmin: false,
    status: "ACTIVE",
    passwordHash: "$2a$12$realhash",
    company: null,
    ...overrides,
  } as never;
}

describe("authorizeCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
  });

  it("returns the session user for valid credentials", async () => {
    const result = await authorizeCredentials(CREDENTIALS, request);
    expect(result).toMatchObject({ id: "user_1", status: "ACTIVE" });
  });

  it("rate limits per IP as well as per email", async () => {
    await authorizeCredentials(CREDENTIALS, request);

    const keys = vi.mocked(checkRateLimit).mock.calls.map((c) => c[0]);
    expect(keys).toContain("login-ip:203.0.113.7");
    expect(keys).toContain("login:jp@example.mg");
  });

  it("rejects once the per-IP limit is exceeded, before touching the database", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (key) =>
      key.startsWith("login-ip:")
        ? { allowed: false, retryAfterSec: 60 }
        : { allowed: true, retryAfterSec: 0 }
    );

    await expect(authorizeCredentials(CREDENTIALS, request)).rejects.toThrow("RATE_LIMITED");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  /**
   * 25 septembre 2026 (audit MVP) — anti-énumération : même coût bcrypt et
   * même réponse générique qu'un mauvais mot de passe.
   */
  it("runs a dummy bcrypt comparison for an unknown email and returns null", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    expect(await authorizeCredentials(CREDENTIALS, request)).toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bcrypt.compare).mock.calls[0][1]).toMatch(/^\$2[aby]\$12\$/);
  });

  it("does not reveal a pending account (no password yet) — generic failure", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      makeUser({ passwordHash: null, status: "PENDING_ACTIVATION" })
    );

    expect(await authorizeCredentials(CREDENTIALS, request)).toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["SUSPENDED", "ACCOUNT_SUSPENDED"],
    ["CANCELLED", "ACCOUNT_SUSPENDED"],
    ["EXPIRED", "ACCOUNT_EXPIRED"],
    ["PENDING_ACTIVATION", "ACCOUNT_PENDING_ACTIVATION"],
  ])("does not reveal a %s account when the password is wrong", async (status) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ status }));
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    expect(await authorizeCredentials(CREDENTIALS, request)).toBeNull();
  });

  it.each([
    ["SUSPENDED", "ACCOUNT_SUSPENDED"],
    ["CANCELLED", "ACCOUNT_SUSPENDED"],
    ["EXPIRED", "ACCOUNT_EXPIRED"],
    ["PENDING_ACTIVATION", "ACCOUNT_PENDING_ACTIVATION"],
  ])("reveals a %s account only once the password is correct", async (status, code) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser({ status }));

    await expect(authorizeCredentials(CREDENTIALS, request)).rejects.toThrow(code);
  });
});
