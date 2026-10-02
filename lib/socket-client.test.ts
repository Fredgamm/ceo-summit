import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("socket.io-client", () => ({ io: vi.fn(() => ({ io: { on: vi.fn(), off: vi.fn() } })) }));

import { io } from "socket.io-client";

type AuthCallback = (cb: (data: object) => void) => void;

function mockTokenResponses(...tokens: string[]) {
  const fetchMock = vi.fn();
  for (const token of tokens) {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { token } }) });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loadClient() {
  vi.resetModules();
  return import("./socket-client");
}

describe("getSocketClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the initial token once, then fetches a fresh one on every reconnection", async () => {
    const fetchMock = mockTokenResponses("token-1", "token-2");
    const { getSocketClient } = await loadClient();
    await getSocketClient();

    const auth = vi.mocked(io).mock.calls[0][1]?.auth as AuthCallback;
    const first = vi.fn();
    auth(first);
    expect(first).toHaveBeenCalledWith({ token: "token-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await new Promise<object>((resolve) => auth(resolve));
    expect(second).toEqual({ token: "token-2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("connects only once across callers", async () => {
    mockTokenResponses("token-1");
    const { getSocketClient } = await loadClient();
    const [a, b] = await Promise.all([getSocketClient(), getSocketClient()]);
    expect(a).toBe(b);
    expect(io).toHaveBeenCalledTimes(1);
  });

  it("lets a later call retry when the first token request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }));
    const { getSocketClient } = await loadClient();
    await expect(getSocketClient()).rejects.toThrow();

    mockTokenResponses("token-1");
    await expect(getSocketClient()).resolves.toBeDefined();
  });
});

describe("onSocketReconnect", () => {
  it("subscribes to the manager's reconnect event and unsubscribes on cleanup", async () => {
    const { onSocketReconnect } = await loadClient();
    const socket = { io: { on: vi.fn(), off: vi.fn() } };
    const rejoin = vi.fn();

    const stop = onSocketReconnect(socket as never, rejoin);
    expect(socket.io.on).toHaveBeenCalledWith("reconnect", rejoin);

    stop();
    expect(socket.io.off).toHaveBeenCalledWith("reconnect", rejoin);
  });
});
