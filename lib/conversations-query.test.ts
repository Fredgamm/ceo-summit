import { describe, expect, it } from "vitest";

import { buildConversationsWhere, otherParticipantId } from "./conversations-query";

describe("buildConversationsWhere", () => {
  it("scopes to conversations the viewer participates in", () => {
    expect(buildConversationsWhere("user_1")).toEqual({
      OR: [{ member1Id: "user_1" }, { member2Id: "user_1" }],
    });
  });
});

describe("otherParticipantId", () => {
  it("returns member2Id when the viewer is member1", () => {
    expect(otherParticipantId({ member1Id: "a", member2Id: "b" }, "a")).toBe("b");
  });

  it("returns member1Id when the viewer is member2", () => {
    expect(otherParticipantId({ member1Id: "a", member2Id: "b" }, "b")).toBe("a");
  });
});
