import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { platformSetting: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_REGISTRATION_URL,
  EVOLIA_SETTING_KEYS,
  decryptSetting,
  encryptSetting,
  getEvoliaConfig,
  getEvoliaSettingsStatus,
} from "./evolia-config";

const SECRET = "a".repeat(28) + "wxyz";

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-nextauth-secret");
  vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function row(key: string, value: string) {
  return { key, value, updatedAt: new Date("2026-10-21T08:00:00Z") };
}

describe("encryptSetting / decryptSetting", () => {
  it("round-trips without storing the plaintext", () => {
    const stored = encryptSetting(SECRET, "k");
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(decryptSetting(stored, "k")).toBe(SECRET);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSetting(SECRET, "k")).not.toBe(encryptSetting(SECRET, "k"));
  });

  it("refuses a ciphertext copied onto another setting key", () => {
    expect(decryptSetting(encryptSetting(SECRET, "k1"), "k2")).toBeNull();
  });

  it("refuses a value once the server secret changed", () => {
    const stored = encryptSetting(SECRET, "k");
    vi.stubEnv("NEXTAUTH_SECRET", "another-secret");
    expect(decryptSetting(stored, "k")).toBeNull();
  });

  it("refuses a plaintext value written straight into the database", () => {
    expect(decryptSetting(SECRET, "k")).toBeNull();
  });
});

describe("getEvoliaConfig", () => {
  it("falls back to env, then defaults", async () => {
    vi.stubEnv("EVOLIA_WEBHOOK_SECRET", "env-out");
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "env-in");
    vi.stubEnv("EVOLIA_REGISTRATION_URL", "");
    const config = await getEvoliaConfig();
    expect(config.outboundSecret).toBe("env-out");
    expect(config.inboundSecret).toBe("env-in");
    expect(config.registrationUrl).toBe(DEFAULT_REGISTRATION_URL);
  });

  it("uses the key saved by the admin in both directions, over env", async () => {
    vi.stubEnv("EVOLIA_WEBHOOK_SECRET", "env-out");
    vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "env-in");
    vi.stubEnv("EVOLIA_REGISTRATION_URL", "https://env.example.com/r");
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      row(EVOLIA_SETTING_KEYS.registrationUrl, "https://admin.example.com/r"),
      row(EVOLIA_SETTING_KEYS.secret, encryptSetting(SECRET, EVOLIA_SETTING_KEYS.secret)),
    ]);
    const config = await getEvoliaConfig();
    expect(config.registrationUrl).toBe("https://admin.example.com/r");
    expect(config.outboundSecret).toBe(SECRET);
    expect(config.inboundSecret).toBe(SECRET);
  });

  it("falls back to env when the stored key is unreadable", async () => {
    vi.stubEnv("EVOLIA_WEBHOOK_SECRET", "env-out");
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      row(EVOLIA_SETTING_KEYS.secret, "enc:v1:garbage"),
    ]);
    expect((await getEvoliaConfig()).outboundSecret).toBe("env-out");
    const status = await getEvoliaSettingsStatus();
    expect(status.secret).toMatchObject({ source: "env", unreadable: true });
  });
});

describe("getEvoliaSettingsStatus", () => {
  it("only exposes the last 4 characters of the key", async () => {
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      row(EVOLIA_SETTING_KEYS.secret, encryptSetting(SECRET, EVOLIA_SETTING_KEYS.secret)),
    ]);
    const status = await getEvoliaSettingsStatus();
    expect(status.secret).toMatchObject({ source: "admin", hint: "…wxyz" });
    expect(JSON.stringify(status)).not.toContain(SECRET);
  });
});
