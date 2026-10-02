import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  canAccessLocalStorageObject,
  classifyLocalStorageObject,
  type LocalStorageAccessLookups,
} from "./local-storage-access";

const BUCKET = "ceo-summit-documents";
const ACTIVE_COMPANY = { subscription: { status: "ACTIVE", plan: { rank: 1 } } };

function makeViewer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    status: "ACTIVE",
    isPlatformAdmin: false,
    company: ACTIVE_COMPANY,
    ...overrides,
  } as never;
}

function makeLookups(overrides: Partial<LocalStorageAccessLookups> = {}) {
  return {
    isActivePlatformAdmin: vi.fn(async () => false),
    findPaymentsByProofKey: vi.fn(async () => []),
    findOpportunitiesByAttachment: vi.fn(async () => []),
    findRoom: vi.fn(async () => null),
    isSentBroadcastAttachment: vi.fn(async () => false),
    ...overrides,
  } satisfies LocalStorageAccessLookups;
}

function seg(key: string, bucket = BUCKET) {
  return [bucket, ...key.split("/")];
}

describe("classifyLocalStorageObject", () => {
  it("classifies the prefixes written by the upload routes", () => {
    expect(classifyLocalStorageObject(seg("avatars/user_1/a.jpg")).kind).toBe("public");
    expect(classifyLocalStorageObject(seg("company-logos/user_1/a.jpg")).kind).toBe("public");
    expect(classifyLocalStorageObject(seg("events/a.jpg")).kind).toBe("public");
    expect(classifyLocalStorageObject(seg("services/user_1/a.jpg")).kind).toBe("public");
    expect(classifyLocalStorageObject(seg("company-payments/user_1/r.pdf"))).toEqual({
      kind: "payment-proof",
      key: "company-payments/user_1/r.pdf",
      uploaderId: "user_1",
    });
    expect(classifyLocalStorageObject(seg("deal-room/user_1/d.pdf"))).toEqual({
      kind: "deal-room",
      key: "deal-room/user_1/d.pdf",
      uploaderId: "user_1",
    });
    expect(classifyLocalStorageObject(seg("salles/room_1/d.pdf"))).toEqual({
      kind: "room-attachment",
      roomId: "room_1",
    });
    expect(classifyLocalStorageObject(seg("broadcasts/abc-plaquette.pdf"))).toEqual({
      kind: "broadcast",
      key: "broadcasts/abc-plaquette.pdf",
    });
  });

  it("classifies an unknown prefix as unknown", () => {
    expect(classifyLocalStorageObject(seg("backups/dump.sql")).kind).toBe("unknown");
    expect(classifyLocalStorageObject(seg("deal-room/d.pdf")).kind).toBe("unknown");
  });

  it("rejects dot segments, separators and too-short paths", () => {
    expect(
      classifyLocalStorageObject(seg(`avatars/../../${BUCKET}/deal-room/user_2/d.pdf`)).kind
    ).toBe("invalid");
    expect(classifyLocalStorageObject([BUCKET, "avatars", "a\\..\\b.jpg"]).kind).toBe("invalid");
    expect(classifyLocalStorageObject([BUCKET, "avatars", "x/y.jpg"]).kind).toBe("invalid");
    expect(classifyLocalStorageObject([BUCKET, "avatars", ""]).kind).toBe("invalid");
    expect(classifyLocalStorageObject([BUCKET, "avatars"]).kind).toBe("invalid");
  });
});

describe("canAccessLocalStorageObject", () => {
  it("serves public images to any authenticated member", async () => {
    const lookups = makeLookups();
    expect(
      await canAccessLocalStorageObject(
        makeViewer({ company: null }),
        seg("avatars/user_2/a.jpg"),
        lookups
      )
    ).toBe(true);
  });

  it("denies unknown prefixes and invalid paths by default", async () => {
    const lookups = makeLookups();
    expect(await canAccessLocalStorageObject(makeViewer(), seg("backups/x.sql"), lookups)).toBe(
      false
    );
    expect(
      await canAccessLocalStorageObject(makeViewer(), seg("avatars/../deal-room/u/x.pdf"), lookups)
    ).toBe(false);
  });

  it("lets an active platform admin read any private object", async () => {
    const lookups = makeLookups({ isActivePlatformAdmin: vi.fn(async () => true) });
    const admin = makeViewer({ id: "admin_1", isPlatformAdmin: true });
    expect(
      await canAccessLocalStorageObject(admin, seg("company-payments/user_2/r.pdf"), lookups)
    ).toBe(true);
    expect(await canAccessLocalStorageObject(admin, seg("deal-room/user_2/d.pdf"), lookups)).toBe(
      true
    );
    expect(await canAccessLocalStorageObject(admin, seg("backups/x.sql"), lookups)).toBe(true);
  });

  describe("payment proofs", () => {
    const key = "company-payments/user_2/r.pdf";

    it("allows the uploader", async () => {
      const lookups = makeLookups();
      expect(
        await canAccessLocalStorageObject(makeViewer({ id: "user_2" }), seg(key), lookups)
      ).toBe(true);
    });

    it("allows the manager of the company the payment belongs to", async () => {
      const lookups = makeLookups({
        findPaymentsByProofKey: vi.fn(async () => [
          { submittedById: "user_2", companyAdminId: "user_1" },
        ]),
      });
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), lookups)).toBe(true);
      expect(lookups.findPaymentsByProofKey).toHaveBeenCalledWith(key);
    });

    it("denies any other member, even a platform admin whose admin account is disabled", async () => {
      const lookups = makeLookups({
        findPaymentsByProofKey: vi.fn(async () => [
          { submittedById: "user_2", companyAdminId: "user_3" },
        ]),
      });
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), lookups)).toBe(false);
      expect(
        await canAccessLocalStorageObject(makeViewer({ isPlatformAdmin: true }), seg(key), lookups)
      ).toBe(false);
    });
  });

  describe("Deal Room attachments", () => {
    const key = "deal-room/user_2/d.pdf";

    it("allows the uploader", async () => {
      const lookups = makeLookups();
      expect(
        await canAccessLocalStorageObject(makeViewer({ id: "user_2" }), seg(key), lookups)
      ).toBe(true);
    });

    it("allows a member with platform access on a PUBLISHED opportunity", async () => {
      const lookups = makeLookups({
        findOpportunitiesByAttachment: vi.fn(async () => [
          { authorId: "user_2", status: "PUBLISHED", visibility: "CHAIRMAN" },
        ]),
      });
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), lookups)).toBe(true);
    });

    it("denies an opportunity that isn't published yet", async () => {
      const lookups = makeLookups({
        findOpportunitiesByAttachment: vi.fn(async () => [
          { authorId: "user_2", status: "PENDING_MODERATION", visibility: "MEMBER" },
        ]),
      });
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), lookups)).toBe(false);
    });

    it("denies a member without platform access (no active company offer)", async () => {
      const lookups = makeLookups({
        findOpportunitiesByAttachment: vi.fn(async () => [
          { authorId: "user_2", status: "PUBLISHED", visibility: "MEMBER" },
        ]),
      });
      expect(
        await canAccessLocalStorageObject(makeViewer({ company: null }), seg(key), lookups)
      ).toBe(false);
    });

    it("denies an attachment referenced by no opportunity", async () => {
      const lookups = makeLookups();
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), lookups)).toBe(false);
    });
  });

  describe("room attachments", () => {
    const key = "salles/room_1/d.pdf";

    it("allows a member with access to the active room", async () => {
      const lookups = makeLookups({
        findRoom: vi.fn(async () => ({ status: "ACTIVE", minTier: "ALL_MEMBERS" })),
      });
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), lookups)).toBe(true);
      expect(lookups.findRoom).toHaveBeenCalledWith("room_1");
    });

    it("denies a member without room access", async () => {
      const lookups = makeLookups({
        findRoom: vi.fn(async () => ({ status: "ACTIVE", minTier: "ALL_MEMBERS" })),
      });
      expect(
        await canAccessLocalStorageObject(makeViewer({ company: null }), seg(key), lookups)
      ).toBe(false);
    });

    it("denies an archived or unknown room", async () => {
      const archived = makeLookups({
        findRoom: vi.fn(async () => ({ status: "ARCHIVED", minTier: "ALL_MEMBERS" })),
      });
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), archived)).toBe(false);
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), makeLookups())).toBe(false);
    });
  });

  describe("broadcast attachments", () => {
    const key = "broadcasts/abc-plaquette.pdf";

    it("allows any member once a sent broadcast references the key", async () => {
      const lookups = makeLookups({ isSentBroadcastAttachment: vi.fn(async () => true) });
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), lookups)).toBe(true);
      expect(lookups.isSentBroadcastAttachment).toHaveBeenCalledWith(key);
    });

    it("denies an uploaded file that no broadcast references", async () => {
      expect(await canAccessLocalStorageObject(makeViewer(), seg(key), makeLookups())).toBe(false);
    });
  });
});
