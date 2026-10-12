import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformSetting: { upsert: vi.fn(), findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";

const fetchMock = vi.fn();

/** Module rechargé à chaque test : son cache en mémoire repart à zéro. */
async function loadModule() {
  vi.resetModules();
  return import("./currency-conversion");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getEurToArRate", () => {
  it("uses the day's rate and saves it as the last known rate", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ rates: { MGA: 5062.93 } })));
    const { getEurToArRate, LAST_EUR_TO_AR_RATE_KEY } = await loadModule();

    expect(await getEurToArRate()).toBe(5062.93);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: LAST_EUR_TO_AR_RATE_KEY } })
    );
  });

  it("falls back to the last saved rate (the day before) when the source is down", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue({
      key: "eur_to_ar_last_rate",
      value: JSON.stringify({ rate: 5011.4, fetchedAt: "2026-10-11T00:02:00.000Z" }),
    } as never);
    const { getEurToArRate } = await loadModule();

    expect(await getEurToArRate()).toBe(5011.4);
  });

  it("uses the fixed rate only when no rate was ever received", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    vi.mocked(prisma.platformSetting.findUnique).mockResolvedValue(null);
    const { getEurToArRate } = await loadModule();

    expect(await getEurToArRate()).toBe(5050);
  });

  it("keeps serving the rate even if saving it fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ rates: { MGA: 5062.93 } })));
    vi.mocked(prisma.platformSetting.upsert).mockRejectedValue(new Error("db down"));
    const { getEurToArRate } = await loadModule();

    expect(await getEurToArRate()).toBe(5062.93);
  });
});
