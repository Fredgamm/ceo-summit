import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    referential: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getReferentialLabels, isValidReferentialLabel } from "./referentials-query";

describe("getReferentialLabels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns labels in position order for the given type", async () => {
    vi.mocked(prisma.referential.findMany).mockResolvedValue([
      { label: "Madagascar" },
      { label: "Île Maurice" },
    ] as never);

    const result = await getReferentialLabels("country");

    expect(prisma.referential.findMany).toHaveBeenCalledWith({
      where: { type: "country" },
      orderBy: { position: "asc" },
      select: { label: true },
    });
    expect(result).toEqual(["Madagascar", "Île Maurice"]);
  });
});

describe("isValidReferentialLabel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when the label exists for that type", async () => {
    vi.mocked(prisma.referential.findFirst).mockResolvedValue({ id: "ref_1" } as never);
    const result = await isValidReferentialLabel("sector", "Finance & Banque");
    expect(result).toBe(true);
  });

  it("returns false when the label doesn't exist", async () => {
    vi.mocked(prisma.referential.findFirst).mockResolvedValue(null);
    const result = await isValidReferentialLabel("sector", "Nonexistent");
    expect(result).toBe(false);
  });
});
