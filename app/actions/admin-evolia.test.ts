import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/lib/evolia", () => ({ startEvoliaReleaseInBackground: vi.fn() }));

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
import { decryptSetting, encryptSetting, EVOLIA_SETTING_KEYS } from "@/lib/evolia-config";
import { startEvoliaReleaseInBackground } from "@/lib/evolia";
import { updateEvoliaSettings, type EvoliaSettingsInput } from "./admin-evolia";

const SECRET = "s3cr3t".repeat(8);

const BASE: EvoliaSettingsInput = {
  registrationUrl: "",
  paymentUrl: "",
  secret: "",
  clearSecret: false,
  live: false,
  currentPassword: "hunter2",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXTAUTH_SECRET", "test-nextauth-secret");
  vi.mocked(auth).mockResolvedValue({
    user: { id: "admin_1", isPlatformAdmin: true },
  } as never);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
    role: "SUPER_ADMIN",
    active: true,
  } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: "hash" } as never);
  vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([]);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
});

describe("updateEvoliaSettings", () => {
  it("is reserved to SUPER_ADMIN", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      role: "FINANCIER",
      active: true,
    } as never);
    await expect(updateEvoliaSettings({ ...BASE, secret: SECRET })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires the admin's password", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const result = await updateEvoliaSettings({ ...BASE, secret: SECRET });
    expect(result).toEqual({ success: false, error: "Mot de passe incorrect." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stops after too many attempts", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 600 });
    const result = await updateEvoliaSettings({ ...BASE, secret: SECRET });
    expect(result.success).toBe(false);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it.each([
    ["http://evolia.example.com/r", "plain http"],
    ["https://127.0.0.1/r", "loopback"],
    ["https://10.0.0.5/r", "private network"],
    ["https://user:pass@evolia.example.com/r", "credentials in URL"],
    ["javascript:alert(1)", "non-http scheme"],
  ])("rejects %s (%s)", async (registrationUrl) => {
    const result = await updateEvoliaSettings({ ...BASE, registrationUrl });
    expect(result.success).toBe(false);
  });

  it("requires the reference placeholder in the payment URL", async () => {
    const result = await updateEvoliaSettings({
      ...BASE,
      paymentUrl: "https://pay.example.com/checkout",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a short secret", async () => {
    const result = await updateEvoliaSettings({ ...BASE, secret: "short" });
    expect(result.success).toBe(false);
  });

  it("stores secrets encrypted and keeps them out of the audit log", async () => {
    const result = await updateEvoliaSettings({
      ...BASE,
      registrationUrl: "https://api.evolia.example.com/registrations",
      secret: SECRET,
    });
    expect(result.success).toBe(true);

    const key = EVOLIA_SETTING_KEYS.secret;
    const upsert = vi
      .mocked(prisma.platformSetting.upsert)
      .mock.calls.find(([args]) => args.where.key === key)?.[0];
    expect(upsert?.create.value).not.toContain(SECRET);
    expect(decryptSetting(upsert!.create.value, key)).toBe(SECRET);

    const audit = vi.mocked(prisma.auditLog.create).mock.calls[0][0];
    expect(JSON.stringify(audit)).not.toContain(SECRET);
    expect(audit.data.metadata).toMatchObject({
      changed: ["registrationUrl", "secret"],
      registrationUrl: "https://api.evolia.example.com/registrations",
    });
  });

  it("writes nothing when nothing changed", async () => {
    const result = await updateEvoliaSettings(BASE);
    expect(result).toEqual({ success: true, data: { changed: [], releaseStarted: false } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to activate Evolia without a key", async () => {
    vi.stubEnv("EVOLIA_WEBHOOK_SECRET", "");
    const result = await updateEvoliaSettings({ ...BASE, live: true });
    expect(result.success).toBe(false);
    expect(startEvoliaReleaseInBackground).not.toHaveBeenCalled();
  });

  it("starts releasing every held push when Evolia is activated with its key", async () => {
    vi.stubEnv("EVOLIA_WEBHOOK_SECRET", "");
    const result = await updateEvoliaSettings({ ...BASE, secret: SECRET, live: true });
    expect(result).toMatchObject({ success: true, data: { releaseStarted: true } });
    expect(startEvoliaReleaseInBackground).toHaveBeenCalledWith("admin_1");
  });

  it("refuses to clear the key while Evolia is activated", async () => {
    vi.stubEnv("EVOLIA_WEBHOOK_SECRET", "");
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      { key: "evolia.live", value: "true", updatedAt: new Date() },
      {
        key: "evolia.webhook_secret",
        value: encryptSetting(SECRET, "evolia.webhook_secret"),
        updatedAt: new Date(),
      },
    ] as never);
    const result = await updateEvoliaSettings({ ...BASE, clearSecret: true, live: true });
    expect(result.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
