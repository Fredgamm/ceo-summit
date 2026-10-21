import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { platformSetting: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { encryptSetting } from "@/lib/settings-crypto";
import { BREVO_SETTING_KEYS, getBrevoConfig, isBrevoReady, sendBrevoBatch } from "./brevo";

const CONFIG = {
  apiKey: "xkeysib-test-key-0000",
  senderEmail: "hello@ceo-summit.mg",
  senderName: "CEO Summit Indian Ocean",
  source: "admin" as const,
  unreadable: false,
  updatedAt: null,
};
const MESSAGE = { subject: "Sujet", htmlContent: "<p>Bonjour</p>", textContent: "Bonjour" };

function recipients(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    email: `m${i}@example.com`,
    params: { prenom: `P${i}` },
  }));
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-nextauth-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getBrevoConfig", () => {
  it("prefers the key saved in the admin over BREVO_API_KEY", async () => {
    vi.stubEnv("BREVO_API_KEY", "env-key");
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([
      {
        key: BREVO_SETTING_KEYS.apiKey,
        value: encryptSetting("xkeysib-admin-key-0000", BREVO_SETTING_KEYS.apiKey),
        updatedAt: new Date(),
      },
    ]);
    const config = await getBrevoConfig();
    expect(config).toMatchObject({ apiKey: "xkeysib-admin-key-0000", source: "admin" });
  });

  it("is not ready without a sender address", async () => {
    vi.stubEnv("BREVO_API_KEY", "env-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValue([]);
    expect(isBrevoReady(await getBrevoConfig())).toBe(false);
  });
});

describe("sendBrevoBatch", () => {
  it("sends 1000 recipients per call, each with its own params", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return jsonResponse(201, {
        messageIds: body.messageVersions.map((_: unknown, i: number) => `<id-${i}>`),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results, errors } = await sendBrevoBatch(CONFIG, MESSAGE, recipients(2500));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String(init.body)).messageVersions.length
    );
    expect(sizes).toEqual([1000, 1000, 500]);
    const first = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(first.sender).toEqual({ email: "hello@ceo-summit.mg", name: "CEO Summit Indian Ocean" });
    expect(first.messageVersions[0]).toEqual({
      to: [{ email: "m0@example.com" }],
      params: { prenom: "P0" },
    });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "api-key": CONFIG.apiKey });
    expect(results).toHaveLength(2500);
    expect(results.every((r) => r.delivered)).toBe(true);
    expect(errors).toEqual([]);
  });

  it("keeps sending the next batches when one is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(402, { code: "not_enough_credits", message: "x" }))
        .mockResolvedValueOnce(jsonResponse(201, { messageIds: ["<a>"] }))
    );

    const { results, errors } = await sendBrevoBatch(CONFIG, MESSAGE, recipients(1001));

    expect(results.slice(0, 1000).every((r) => !r.delivered)).toBe(true);
    expect(results[1000]).toEqual({ delivered: true, messageId: "<a>" });
    expect(errors).toEqual(["Crédits d'envoi Brevo épuisés : rechargez le compte Brevo."]);
  });

  it("explains a rejected API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { message: "Key not found" }))
    );
    const { errors } = await sendBrevoBatch(CONFIG, MESSAGE, recipients(1));
    expect(errors[0]).toMatch(/Clé d'API Brevo refusée/);
  });

  it("explains an unvalidated sender", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { message: "Sender is not valid" }))
    );
    const { errors } = await sendBrevoBatch(CONFIG, MESSAGE, recipients(1));
    expect(errors[0]).toMatch(/Expéditeur refusé par Brevo/);
  });
});
