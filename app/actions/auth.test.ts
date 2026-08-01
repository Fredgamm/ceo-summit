import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    activationToken: { create: vi.fn() },
  },
}));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("@/emails/signup-confirm-email", () => ({ default: vi.fn(() => null) }));

import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import { signup } from "./auth";

describe("signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://app.ceosummit.mg";
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user_1",
      name: "Jean-Pierre Rakoto",
      email: "jp.rakoto@example.mg",
    } as never);
  });

  it("creates a PENDING_ACTIVATION user with no password and emails a confirmation link", async () => {
    const result = await signup("Jean-Pierre Rakoto", "jp.rakoto@example.mg");

    expect(result.success).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Jean-Pierre Rakoto",
          email: "jp.rakoto@example.mg",
          status: "PENDING_ACTIVATION",
        }),
      })
    );
    expect(prisma.activationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user_1" }) })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jp.rakoto@example.mg" })
    );
  });

  it("rejects an email already tied to an account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await signup("Jean-Pierre Rakoto", "jp.rakoto@example.mg");

    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a name that is too short", async () => {
    const result = await signup("J", "jp.rakoto@example.mg");
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const result = await signup("Jean-Pierre Rakoto", "not-an-email");
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("lowercases the email before checking and storing", async () => {
    await signup("Jean-Pierre Rakoto", "Jean.Rakoto@Example.MG");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "jean.rakoto@example.mg" },
    });
  });
});
