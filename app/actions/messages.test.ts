import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/conversations", () => ({ getOrCreateConversation: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateConversation } from "@/lib/conversations";
import { startConversation } from "./messages";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;
const ACTIVE_VIEWER = { id: "user_1", status: "ACTIVE", company: null } as never;

describe("startConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ACTIVE_VIEWER);
  });

  it("rejects an unauthenticated call", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await startConversation("user_2");
    expect(result.success).toBe(false);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  /**
   * Correctif (refactor dette technique, sept. 2026) — audit du 7 août,
   * "session non révoquée après sanction" : cette action utilisait un
   * `auth()` brut, sans jamais relire `User.status` en base.
   */
  it("rejects a suspended/excluded member even with a valid session", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "SUSPENDED",
      company: null,
    } as never);
    const result = await startConversation("user_2");
    expect(result.success).toBe(false);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("rejects starting a conversation with yourself", async () => {
    const result = await startConversation("user_1");
    expect(result.success).toBe(false);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("finds or creates the conversation and returns its id", async () => {
    vi.mocked(getOrCreateConversation).mockResolvedValue({ id: "conv_1" } as never);
    const result = await startConversation("user_2", "opp_1");
    expect(result).toEqual({ success: true, data: { id: "conv_1" } });
    expect(getOrCreateConversation).toHaveBeenCalledWith("user_1", "user_2", "opp_1");
  });
});
