import { describe, expect, it } from "vitest";

import { pushAvailability, urlBase64ToUint8Array } from "./push-availability";

const base = {
  hasPushApi: true,
  isIos: false,
  standalone: false,
  configured: true,
  permission: "default" as NotificationPermission | "unavailable",
  subscribed: false,
};

describe("pushAvailability", () => {
  it("offers to activate when possible and not yet done", () => {
    expect(pushAvailability(base)).toBe("off");
  });

  it("is on only with the permission AND a subscription", () => {
    expect(pushAvailability({ ...base, permission: "granted", subscribed: true })).toBe("on");
    expect(pushAvailability({ ...base, permission: "granted", subscribed: false })).toBe("off");
    expect(pushAvailability({ ...base, permission: "default", subscribed: true })).toBe("off");
  });

  it("explains a blocked permission", () => {
    expect(pushAvailability({ ...base, permission: "denied" })).toBe("denied");
  });

  it("asks an iPhone in Safari to install the app first, and stays silent elsewhere", () => {
    const noApi = { ...base, hasPushApi: false, permission: "unavailable" as const };
    expect(pushAvailability({ ...noApi, isIos: true, standalone: false })).toBe("ios-install");
    expect(pushAvailability({ ...noApi, isIos: true, standalone: true })).toBe("unsupported");
    expect(pushAvailability(noApi)).toBe("unsupported");
  });

  it("hides the feature when the server has no keys", () => {
    expect(pushAvailability({ ...base, configured: false })).toBe("unconfigured");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url key (no padding, - and _)", () => {
    // « ??>> » encodé en base64url : Pz8-Pg
    expect(Array.from(urlBase64ToUint8Array("Pz8-Pg"))).toEqual([63, 63, 62, 62]);
  });
});
