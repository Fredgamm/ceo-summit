import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activationToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    user: { update: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/email-template-resolver", () => ({
  resolveEmail: vi.fn().mockResolvedValue({ subject: "s", react: null }),
}));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn().mockResolvedValue({}) }));

import { prisma } from "@/lib/prisma";
import { resolveEmail } from "@/lib/email-template-resolver";
import { sendTransactionalEmail } from "@/lib/resend";
import { sendEmailVerification, verifyEmailToken } from "./email-verification";

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

function token(overrides: Record<string, unknown> = {}) {
  return {
    id: "tok_1",
    userId: "user_1",
    usedAt: null,
    expiresAt: FUTURE,
    user: { id: "user_1", emailVerifiedAt: null },
    ...overrides,
  } as never;
}

describe("verifyEmailToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.activationToken.updateMany).mockResolvedValue({ count: 1 });
  });

  it("confirms the address and consumes the link", async () => {
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue(token());

    const result = await verifyEmailToken("abc");

    expect(result).toEqual({ status: "verified", userId: "user_1", alreadyVerified: false });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { emailVerifiedAt: expect.any(Date) },
    });
  });

  it("rejects an unknown link", async () => {
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue(null);

    expect(await verifyEmailToken("nope")).toEqual({ status: "invalid" });
  });

  it("rejects an expired link without confirming anything", async () => {
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue(
      token({ expiresAt: new Date(Date.now() - 1000) })
    );

    expect(await verifyEmailToken("old")).toEqual({ status: "expired" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("treats a second click on a used link as already verified", async () => {
    vi.mocked(prisma.activationToken.findUnique).mockResolvedValue(
      token({ usedAt: new Date(), user: { id: "user_1", emailVerifiedAt: new Date() } })
    );

    expect(await verifyEmailToken("abc")).toEqual({
      status: "verified",
      userId: "user_1",
      alreadyVerified: true,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("sendEmailVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "https://b2b.ceo-summit.mg";
  });

  it("replaces previous unused links and emails a link to this instance", async () => {
    const sent = await sendEmailVerification({
      id: "user_1",
      name: "Marie",
      email: "marie@test.local",
    });

    expect(sent).toBe(true);
    expect(prisma.activationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user_1", usedAt: null },
    });
    expect(resolveEmail).toHaveBeenCalledWith("email-verification", {
      memberName: "Marie",
      verifyUrl: expect.stringMatching(
        /^https:\/\/b2b\.ceo-summit\.mg\/verifier-email\/[\w-]{20,}$/
      ),
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "marie@test.local" })
    );
  });

  it("reports a failed send instead of throwing", async () => {
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("smtp down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await sendEmailVerification({ id: "u", name: "n", email: "e@x.mg" })).toBe(false);
    errorSpy.mockRestore();
  });
});
