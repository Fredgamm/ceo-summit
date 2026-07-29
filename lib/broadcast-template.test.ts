import { describe, expect, it } from "vitest";

import { renderBroadcastBody } from "./broadcast-template";

const VARS = { prenom: "Jean-Pierre", nom: "Rakoto", tier: "Executive", entreprise: "TechOcean" };

describe("renderBroadcastBody", () => {
  it("substitutes all known variables", () => {
    const result = renderBroadcastBody(
      "Bonjour {{prénom}} {{nom}} ({{tier}}, {{entreprise}})",
      VARS
    );
    expect(result).toBe("Bonjour Jean-Pierre Rakoto (Executive, TechOcean)");
  });

  it("substitutes a variable used multiple times", () => {
    expect(renderBroadcastBody("{{prénom}}, encore {{prénom}} !", VARS)).toBe(
      "Jean-Pierre, encore Jean-Pierre !"
    );
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderBroadcastBody("{{prénom}} — {{inconnu}}", VARS)).toBe("Jean-Pierre — {{inconnu}}");
  });

  it("returns the body unchanged when it has no placeholders", () => {
    expect(renderBroadcastBody("Aucune variable ici.", VARS)).toBe("Aucune variable ici.");
  });
});
