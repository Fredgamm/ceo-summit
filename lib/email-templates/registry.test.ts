import { describe, expect, it } from "vitest";

import { EMAIL_TEMPLATES, getTemplateDefinition, UnknownEmailTemplateError } from "./registry";
import { extractBlockVariableRefs, extractVariableRefs } from "@/lib/email-blocks";

/**
 * Garde-fou pour le portage du Lot 1 (voir
 * C:\Users\Fredo\.claude\plans\moonlit-napping-muffin.md §9) : chaque agent
 * qui porte une catégorie vers son fichier lib/email-templates/<categorie>.ts
 * doit respecter ces règles, sinon ce test échoue et le repère
 * immédiatement — avant que ça n'atteigne l'admin ou la prod.
 */
describe("EMAIL_TEMPLATES registry", () => {
  const definitions = Object.values(EMAIL_TEMPLATES);

  it("has no duplicate keys", () => {
    const keys = definitions.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(definitions)(
    "$key — every {{variable}} used in defaultSubject/defaultBlocks is declared in variables[]",
    (def) => {
      const allowedKeys = new Set(def.variables.map((v) => v.key));
      const usedInSubject = extractVariableRefs(def.defaultSubject);
      const usedInBlocks = def.defaultBlocks.flatMap(extractBlockVariableRefs);

      for (const ref of [...usedInSubject, ...usedInBlocks]) {
        expect(allowedKeys.has(ref)).toBe(true);
      }
    }
  );

  it.each(definitions)("$key — has at least one default block", (def) => {
    expect(def.defaultBlocks.length).toBeGreaterThan(0);
  });

  it.each(definitions)("$key — block ids are unique within the template", (def) => {
    const ids = def.defaultBlocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getTemplateDefinition", () => {
  it("throws UnknownEmailTemplateError on an unknown key", () => {
    expect(() => getTemplateDefinition("__does_not_exist__")).toThrow(UnknownEmailTemplateError);
  });
});
