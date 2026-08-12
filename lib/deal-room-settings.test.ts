import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getDealRoomContactCost, setDealRoomContactCost } from "./deal-room-settings";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDealRoomContactCost", () => {
  it("falls back to the default (1) when no admin override is stored", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);
    expect(await getDealRoomContactCost()).toBe(1);
  });

  it("returns the admin-configured value", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      key: "deal_room_contact_cost",
      value: "3",
    } as never);
    expect(await getDealRoomContactCost()).toBe(3);
  });

  /** Un admin peut le mettre à 0 pour rendre le contact gratuit pour tous. */
  it("returns 0 when the admin has made contact free", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      key: "deal_room_contact_cost",
      value: "0",
    } as never);
    expect(await getDealRoomContactCost()).toBe(0);
  });

  it("falls back to the default if the stored value is somehow corrupted", async () => {
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      key: "deal_room_contact_cost",
      value: "not-a-number",
    } as never);
    expect(await getDealRoomContactCost()).toBe(1);
  });
});

describe("setDealRoomContactCost", () => {
  it("upserts the setting as a string", async () => {
    await setDealRoomContactCost(0);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith({
      where: { key: "deal_room_contact_cost" },
      update: { value: "0" },
      create: { key: "deal_room_contact_cost", value: "0" },
    });
  });
});
