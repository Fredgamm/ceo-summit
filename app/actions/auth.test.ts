import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { signup } from "./auth";

const VALID = {
  name: "Jean-Pierre Rakoto",
  email: "jp.rakoto@example.mg",
  password: "Password1",
  confirmPassword: "Password1",
};

describe("signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user_1",
      name: VALID.name,
      email: VALID.email,
    } as never);
  });

  it("creates an ACTIVE user with a password hash set immediately (no activation email step)", async () => {
    const result = await signup(VALID.name, VALID.email, VALID.password, VALID.confirmPassword);

    expect(result.success).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: VALID.name,
          email: VALID.email,
          status: "ACTIVE",
          passwordHash: expect.any(String),
        }),
      })
    );
  });

  it("rejects an email already tied to an account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);

    const result = await signup(VALID.name, VALID.email, VALID.password, VALID.confirmPassword);

    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a name that is too short", async () => {
    const result = await signup("J", VALID.email, VALID.password, VALID.confirmPassword);
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const result = await signup(VALID.name, "not-an-email", VALID.password, VALID.confirmPassword);
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const result = await signup(VALID.name, VALID.email, VALID.password, "Different1");
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a weak password", async () => {
    const result = await signup(VALID.name, VALID.email, "weak", "weak");
    expect(result.success).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("lowercases the email before checking and storing", async () => {
    await signup(VALID.name, "Jean.Rakoto@Example.MG", VALID.password, VALID.confirmPassword);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "jean.rakoto@example.mg" },
    });
  });
});
