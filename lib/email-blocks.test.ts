import { describe, expect, it } from "vitest";

import {
  substituteVariables,
  substituteBlocks,
  extractVariableRefs,
  extractBlockVariableRefs,
  parseInlineMarkdown,
  type EmailBlock,
} from "./email-blocks";

describe("substituteVariables", () => {
  it("replaces known keys", () => {
    expect(substituteVariables("Bonjour {{name}} !", { name: "Marie" })).toBe("Bonjour Marie !");
  });

  it("replaces numeric values by their string form", () => {
    expect(substituteVariables("{{amount}} Ar", { amount: 5000 })).toBe("5000 Ar");
  });

  it("leaves unknown keys untouched", () => {
    expect(substituteVariables("Bonjour {{typo}} !", { name: "Marie" })).toBe("Bonjour {{typo}} !");
  });

  it("replaces the same key repeated several times", () => {
    expect(substituteVariables("{{name}}, {{name}} !", { name: "Marie" })).toBe("Marie, Marie !");
  });
});

describe("substituteBlocks", () => {
  const vars = { name: "Marie", url: "https://example.com" };

  it("substitutes text in heading/paragraph blocks", () => {
    const blocks: EmailBlock[] = [
      { id: "1", type: "heading", text: "Bonjour {{name}}" },
      { id: "2", type: "paragraph", text: "Voir {{url}}" },
    ];
    const result = substituteBlocks(blocks, vars);
    expect(result[0]).toEqual({ id: "1", type: "heading", text: "Bonjour Marie" });
    expect(result[1]).toEqual({ id: "2", type: "paragraph", text: "Voir https://example.com" });
  });

  it("substitutes label/url in button blocks", () => {
    const blocks: EmailBlock[] = [
      { id: "1", type: "button", label: "Bonjour {{name}}", url: "{{url}}" },
    ];
    expect(substituteBlocks(blocks, vars)).toEqual([
      { id: "1", type: "button", label: "Bonjour Marie", url: "https://example.com" },
    ]);
  });

  it("substitutes every item in list blocks", () => {
    const blocks: EmailBlock[] = [
      { id: "1", type: "list", style: "bullet", items: ["{{name}}", "fixe"] },
    ];
    expect(substituteBlocks(blocks, vars)).toEqual([
      { id: "1", type: "list", style: "bullet", items: ["Marie", "fixe"] },
    ]);
  });

  it("leaves divider blocks untouched", () => {
    const blocks: EmailBlock[] = [{ id: "1", type: "divider" }];
    expect(substituteBlocks(blocks, vars)).toEqual(blocks);
  });
});

describe("extractVariableRefs / extractBlockVariableRefs", () => {
  it("finds all references in a string", () => {
    expect(extractVariableRefs("{{a}} et {{b}} et {{a}}")).toEqual(["a", "b", "a"]);
  });

  it("finds references across every field of a block type", () => {
    expect(
      extractBlockVariableRefs({ id: "1", type: "button", label: "{{a}}", url: "{{b}}" })
    ).toEqual(["a", "b"]);
    expect(
      extractBlockVariableRefs({
        id: "1",
        type: "list",
        style: "bullet",
        items: ["{{a}}", "{{b}}"],
      })
    ).toEqual(["a", "b"]);
    expect(extractBlockVariableRefs({ id: "1", type: "divider" })).toEqual([]);
  });
});

describe("parseInlineMarkdown", () => {
  it("parses plain text with no markup", () => {
    expect(parseInlineMarkdown("Bonjour")).toEqual([{ kind: "text", value: "Bonjour" }]);
  });

  it("parses bold", () => {
    expect(parseInlineMarkdown("**gras**")).toEqual([{ kind: "bold", value: "gras" }]);
  });

  it("parses italic", () => {
    expect(parseInlineMarkdown("_italique_")).toEqual([{ kind: "italic", value: "italique" }]);
  });

  it("parses a link with a safe scheme", () => {
    expect(parseInlineMarkdown("[texte](https://example.com)")).toEqual([
      { kind: "link", value: "texte", href: "https://example.com" },
    ]);
  });

  it("accepts mailto: links", () => {
    expect(parseInlineMarkdown("[email](mailto:a@b.com)")).toEqual([
      { kind: "link", value: "email", href: "mailto:a@b.com" },
    ]);
  });

  it("never turns a javascript: URL into a clickable href", () => {
    // Le charset de l'URL ([^()\s]+) ne matche pas les parenthèses internes
    // de "alert(1)" — le motif entier échoue et le texte reste littéral.
    // Sûr dans les deux cas : jamais de lien cliquable produit.
    const tokens = parseInlineMarkdown("[cliquez](javascript:alert(1))");
    expect(tokens.some((t) => t.kind === "link")).toBe(false);
  });

  it("strips a javascript: link with no parentheses in the URL down to plain text", () => {
    expect(parseInlineMarkdown("[cliquez](javascript:doEvil)")).toEqual([
      { kind: "text", value: "cliquez" },
    ]);
  });

  it("mixes text, bold, italic and link in one pass", () => {
    expect(
      parseInlineMarkdown("Bonjour **Marie**, voir [ce lien](https://x.mg) et _bonne journée_.")
    ).toEqual([
      { kind: "text", value: "Bonjour " },
      { kind: "bold", value: "Marie" },
      { kind: "text", value: ", voir " },
      { kind: "link", value: "ce lien", href: "https://x.mg" },
      { kind: "text", value: " et " },
      { kind: "italic", value: "bonne journée" },
      { kind: "text", value: "." },
    ]);
  });
});
