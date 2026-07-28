import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { GET } from "./route";

const AUTHED_SESSION = { user: { id: "user_1" } } as never;

describe("GET /api/socket/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION);
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns a JWT encoding the user id, valid against NEXTAUTH_SECRET", async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    const decoded = jwt.verify(json.data.token, "test-secret") as { sub: string };
    expect(decoded.sub).toBe("user_1");
  });
});
