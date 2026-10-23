import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { platformSetting: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { PREREGISTRATION_SETTING_KEYS, getPreregistrationStatus } from "./preregistration";

function setting(key: string, value: string) {
  return { key, value, updatedAt: new Date() };
}

beforeEach(() => {
  vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([]);
});

describe("getPreregistrationStatus", () => {
  it("is off without an opening day", async () => {
    expect(await getPreregistrationStatus()).toMatchObject({ active: false, paymentsOpenAt: null });
  });

  it("keeps payments closed until midnight, Madagascar time, on the opening day", async () => {
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      setting(PREREGISTRATION_SETTING_KEYS.paymentsOpenOn, "2027-01-15"),
    ]);
    // 15 janv. 2027 00:00 à Madagascar (UTC+3) = 14 janv. 21:00 UTC.
    const before = await getPreregistrationStatus(new Date("2027-01-14T20:59:00Z"));
    const after = await getPreregistrationStatus(new Date("2027-01-14T21:00:00Z"));
    expect(before.paymentsOpenAt?.toISOString()).toBe("2027-01-14T21:00:00.000Z");
    expect(before.active).toBe(true);
    expect(after.active).toBe(false);
  });
});
