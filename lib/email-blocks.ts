/**
 * Bibliothèque d'emails transactionnels éditable (audit MVP, 25 septembre
 * 2026) — format de bloc structuré pour l'éditeur admin "WYSIWYG".
 *
 * Délibérément PAS du HTML libre : un éditeur par blocs (titre, paragraphe,
 * bouton, séparateur, liste), sérialisé en JSON, rendu par nos propres
 * composants React Email de confiance (emails/dynamic-email.tsx). Aucun
 * `dangerouslySetInnerHTML` nulle part dans ce chemin — un admin ne peut
 * jamais injecter de HTML/JS arbitraire dans un email envoyé aux membres.
 * C'est aussi ce qui garantit un rendu correct dans les clients mail
 * (Outlook etc.), contrairement à du HTML libre.
 */

export type EmailBlock =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "paragraph"; text: string } // supporte **gras**, _italique_, [texte](url)
  | { id: string; type: "button"; label: string; url: string }
  | { id: string; type: "divider" }
  | { id: string; type: "list"; style: "bullet" | "number"; items: string[] };

export type EmailBlockType = EmailBlock["type"];

export type TemplateVariables = Record<string, string | number>;

/**
 * Remplacement `{{variable}}` simple — même esprit que
 * `lib/broadcast-template.ts::renderBroadcastBody`, généralisé à une clé
 * arbitraire au lieu de 4 champs fixes. Une clé absente de `vars` est
 * laissée telle quelle (un `{{typo}}` littéral est repéré à l'enregistrement
 * par la validation admin, pas avalé silencieusement ici).
 */
export function substituteVariables(text: string, vars: TemplateVariables): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

export function substituteBlocks(blocks: EmailBlock[], vars: TemplateVariables): EmailBlock[] {
  const sub = (s: string) => substituteVariables(s, vars);
  return blocks.map((block): EmailBlock => {
    switch (block.type) {
      case "heading":
      case "paragraph":
        return { ...block, text: sub(block.text) };
      case "button":
        return { ...block, label: sub(block.label), url: sub(block.url) };
      case "list":
        return { ...block, items: block.items.map(sub) };
      case "divider":
        return block;
    }
  });
}

/** Toutes les références `{{clé}}` trouvées dans un texte, sans déduplication. */
export function extractVariableRefs(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
}

export function extractBlockVariableRefs(block: EmailBlock): string[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return extractVariableRefs(block.text);
    case "button":
      return [...extractVariableRefs(block.label), ...extractVariableRefs(block.url)];
    case "list":
      return block.items.flatMap(extractVariableRefs);
    case "divider":
      return [];
  }
}

export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "link"; value: string; href: string };

const INLINE_PATTERN = /\[([^[\]]+)\]\(([^()\s]+)\)|\*\*([^*]+)\*\*|_([^_]+)_/g;
const SAFE_URL_SCHEME = /^(https?:|mailto:)/i;

/**
 * Parseur "markdown-lite" à une seule passe, non imbriqué, pour le
 * formatage inline des blocs `heading`/`paragraph`/`list` : `**gras**`,
 * `_italique_`, `[texte](url)`. Ne produit jamais de HTML — chaque jeton
 * devient un élément React (`<strong>`/`<em>`/`<a>`) côté
 * emails/dynamic-email.tsx.
 *
 * `href` est filtré par schéma : un `javascript:...` (session admin
 * compromise, ou simple faute de frappe) ne devient jamais un lien
 * cliquable — le texte reste affiché, mais sans lien.
 */
export function parseInlineMarkdown(raw: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  for (const match of raw.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ kind: "text", value: raw.slice(lastIndex, index) });
    if (match[1] !== undefined) {
      const href = match[2];
      tokens.push(
        SAFE_URL_SCHEME.test(href)
          ? { kind: "link", value: match[1], href }
          : { kind: "text", value: match[1] }
      );
    } else if (match[3] !== undefined) {
      tokens.push({ kind: "bold", value: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ kind: "italic", value: match[4] });
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < raw.length) tokens.push({ kind: "text", value: raw.slice(lastIndex) });
  return tokens;
}
