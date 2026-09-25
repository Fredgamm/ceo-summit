import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

describe("GET /api/socket/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
    } as never);
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  /** Audit sécurité (25 septembre 2026) — statut relu en base, pas seulement la session. */
  it("refuses a token to an account that is no longer ACTIVE", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "SUSPENDED",
    } as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("refuses a token to a session opened before the last password reset", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user_1", loginAt: 1_000 } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
      passwordChangedAt: new Date(2_000),
    } as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns a JWT encoding the user id, valid against NEXTAUTH_SECRET", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    const decoded = jwt.verify(json.data.token, "test-secret") as { sub: string };
    expect(decoded.sub).toBe("user_1");
  });
});
