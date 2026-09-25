import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isViewerSessionValid, requireViewer } from "./require-viewer";

const LOGIN_AT = new Date("2026-09-25T08:00:00Z").getTime();

describe("isViewerSessionValid", () => {
  it("accepts an ACTIVE user who never changed their password", () => {
    expect(isViewerSessionValid({ status: "ACTIVE", passwordChangedAt: null }, LOGIN_AT)).toBe(
      true
    );
  });

  it("rejects a non-ACTIVE user", () => {
    expect(isViewerSessionValid({ status: "SUSPENDED" }, LOGIN_AT)).toBe(false);
    expect(isViewerSessionValid({ status: "CANCELLED" }, LOGIN_AT)).toBe(false);
  });

  /**
   * Audit sécurité (25 septembre 2026) — une réinitialisation de mot de
   * passe ne révoquait aucune session déjà ouverte.
   */
  it("rejects a session opened before the last password change", () => {
    const changedAt = new Date(LOGIN_AT + 60_000);
    expect(isViewerSessionValid({ status: "ACTIVE", passwordChangedAt: changedAt }, LOGIN_AT)).toBe(
      false
    );
  });

  it("accepts a session opened after the last password change", () => {
    const changedAt = new Date(LOGIN_AT - 60_000);
    expect(isViewerSessionValid({ status: "ACTIVE", passwordChangedAt: changedAt }, LOGIN_AT)).toBe(
      true
    );
  });

  it("rejects a legacy session (no loginAt) once a password change is recorded", () => {
    expect(
      isViewerSessionValid({ status: "ACTIVE", passwordChangedAt: new Date(LOGIN_AT) }, null)
    ).toBe(false);
    expect(isViewerSessionValid({ status: "ACTIVE", passwordChangedAt: null }, null)).toBe(true);
  });
});

describe("requireViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user_1", loginAt: LOGIN_AT } } as never);
  });

  it("rejects when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await requireViewer()).success).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns the viewer for an ACTIVE account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
      passwordChangedAt: null,
    } as never);
    const result = await requireViewer();
    expect(result.success).toBe(true);
  });

  it("rejects a session opened before a password reset", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
      passwordChangedAt: new Date(LOGIN_AT + 1000),
    } as never);
    expect((await requireViewer()).success).toBe(false);
  });

  it("rejects a suspended account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "SUSPENDED",
    } as never);
    expect((await requireViewer()).success).toBe(false);
  });
});
