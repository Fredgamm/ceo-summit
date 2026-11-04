import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import webpush from "web-push";

import { prisma } from "@/lib/prisma";
import { buildPushMessage, pushConfigured, sendPushToUser } from "./push";

const sub = (id: string) => ({
  id,
  endpoint: `https://push.example/${id}`,
  p256dh: "k",
  auth: "a",
});
const payload = { title: "Titre", body: "Texte", url: "/profil?onglet=mes-rendez-vous", tag: "t" };

describe("buildPushMessage", () => {
  it("keeps internal links and shortens long texts", () => {
    const message = JSON.parse(
      buildPushMessage({ title: "T".repeat(200), body: "B ".repeat(200), url: "/x" })
    );
    expect(message.title.length).toBeLessThanOrEqual(60);
    expect(message.body.length).toBeLessThanOrEqual(140);
    expect(message.body.endsWith("…")).toBe(true);
    expect(message.url).toBe("/x");
  });

  it("never carries an outside link", () => {
    for (const url of ["https://evil.example", "//evil.example", "javascript:alert(1)"]) {
      expect(JSON.parse(buildPushMessage({ title: "t", body: "b", url })).url).toBe("/");
    }
  });
});

describe("sendPushToUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    vi.mocked(prisma.pushSubscription.update).mockResolvedValue({} as never);
    vi.mocked(prisma.pushSubscription.deleteMany).mockResolvedValue({ count: 1 });
  });

  it("does nothing without VAPID keys", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(pushConfigured()).toBe(false);

    expect(await sendPushToUser("u1", payload)).toBe(0);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("sends to every device of the member and counts the ones reached", async () => {
    vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([sub("a"), sub("b")] as never);
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

    expect(await sendPushToUser("u1", payload)).toBe(2);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example/a", keys: { p256dh: "k", auth: "a" } },
      expect.stringContaining('"title":"Titre"'),
      expect.objectContaining({ TTL: expect.any(Number) })
    );
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  it("forgets a device the push service says is gone (410), keeps it on other errors", async () => {
    vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([
      sub("gone"),
      sub("down"),
    ] as never);
    vi.mocked(webpush.sendNotification).mockImplementation((async (target: {
      endpoint: string;
    }) => {
      throw Object.assign(new Error("x"), {
        statusCode: target.endpoint.endsWith("gone") ? 410 : 500,
      });
    }) as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await sendPushToUser("u1", payload)).toBe(0);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "gone" } });
  });

  it("never throws, even when the database fails", async () => {
    vi.mocked(prisma.pushSubscription.findMany).mockRejectedValue(new Error("db"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendPushToUser("u1", payload)).resolves.toBe(0);
  });
});
