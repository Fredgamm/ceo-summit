import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/conversations", () => ({ getOrCreateConversation: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@/auth";
import { getOrCreateConversation } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { startConversation } from "./messages";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

describe("startConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "ACTIVE",
    } as never);
  });

  /** Audit sécurité (25 septembre 2026) — statut relu en base, pas seulement la session. */
  it("rejects a suspended member whose session is still open", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      status: "SUSPENDED",
    } as never);
    const result = await startConversation("user_2");
    expect(result.success).toBe(false);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated call", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await startConversation("user_2");
    expect(result.success).toBe(false);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("rejects starting a conversation with yourself", async () => {
    const result = await startConversation("user_1");
    expect(result.success).toBe(false);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("rejects a recipient that does not exist or is no longer active", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: "user_1", status: "ACTIVE" } as never)
      .mockResolvedValueOnce({ status: "SUSPENDED" } as never);
    const result = await startConversation("user_2");
    expect(result.success).toBe(false);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("finds or creates the conversation and returns its id", async () => {
    vi.mocked(getOrCreateConversation).mockResolvedValue({ id: "conv_1" } as never);
    const result = await startConversation("user_2");
    expect(result).toEqual({ success: true, data: { id: "conv_1" } });
    expect(getOrCreateConversation).toHaveBeenCalledWith("user_1", "user_2");
  });
});
