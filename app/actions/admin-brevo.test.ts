import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    platformSetting: {
      findMany: vi.fn(),
      upsert: vi.fn((args) => ({ op: "upsert", args })),
      deleteMany: vi.fn((args) => ({ op: "deleteMany", args })),
    },
    auditLog: { create: vi.fn((args) => ({ op: "audit", args })) },
    $transaction: vi.fn(),
  },
}));

import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { decryptSetting } from "@/lib/settings-crypto";
import { BREVO_SETTING_KEYS } from "@/lib/brevo";
import { updateBrevoSettings, type BrevoSettingsInput } from "./admin-brevo";

const KEY = "xkeysib-0123456789abcdef0123456789";

const BASE: BrevoSettingsInput = {
  apiKey: "",
  clearApiKey: false,
  senderEmail: "",
  senderName: "",
  currentPassword: "hunter2",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXTAUTH_SECRET", "test-nextauth-secret");
  vi.mocked(auth).mockResolvedValue({ user: { id: "admin_1", isPlatformAdmin: true } } as never);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
    role: "SUPER_ADMIN",
    active: true,
  } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: "hash" } as never);
  vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([]);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
});

describe("updateBrevoSettings", () => {
  it("is reserved to SUPER_ADMIN", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      role: "MODERATEUR",
      active: true,
    } as never);
    await expect(updateBrevoSettings({ ...BASE, apiKey: KEY })).rejects.toThrow();
  });

  it("requires the admin's password", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const result = await updateBrevoSettings({ ...BASE, apiKey: KEY });
    expect(result).toEqual({ success: false, error: "Mot de passe incorrect." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid sender address", async () => {
    const result = await updateBrevoSettings({ ...BASE, senderEmail: "pas-une-adresse" });
    expect(result.success).toBe(false);
  });

  it("stores the key encrypted and keeps it out of the audit log", async () => {
    const result = await updateBrevoSettings({
      ...BASE,
      apiKey: KEY,
      senderEmail: "hello@ceo-summit.mg",
    });
    expect(result).toEqual({
      success: true,
      data: { changed: ["clé d'API", "adresse d'expéditeur"] },
    });

    const upsert = vi
      .mocked(prisma.platformSetting.upsert)
      .mock.calls.find(([args]) => args.where.key === BREVO_SETTING_KEYS.apiKey)?.[0];
    expect(upsert?.create.value).not.toContain(KEY);
    expect(decryptSetting(upsert!.create.value, BREVO_SETTING_KEYS.apiKey)).toBe(KEY);
    expect(JSON.stringify(vi.mocked(prisma.auditLog.create).mock.calls)).not.toContain(KEY);
  });

  it("writes nothing when nothing changed", async () => {
    const result = await updateBrevoSettings(BASE);
    expect(result).toEqual({ success: true, data: { changed: [] } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
