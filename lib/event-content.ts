/**
 * Shared program/speakers parsing for Event.program / Event.speakers (Json
 * columns) — used by the member-facing detail page (E3-T02, read-only) and
 * the admin form (E3-T05, read/write). Kept in one place so both sides
 * agree on the shape.
 *
 * The admin form edits these as plain text (one line per item/speaker)
 * rather than a full drag-and-drop block editor — deliberately simple,
 * matching the backlog's "Programme" bullet without inventing UI the
 * backlog never asked for.
 */

export interface ProgramBlock {
  day: string;
  items: string[];
}

export interface Speaker {
  name: string;
  title?: string;
  company?: string;
}

export function parseProgram(json: unknown): ProgramBlock[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (b): b is ProgramBlock =>
      !!b && typeof b === "object" && typeof (b as ProgramBlock).day === "string"
  );
}

export function parseSpeakers(json: unknown): Speaker[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (s): s is Speaker => !!s && typeof s === "object" && typeof (s as Speaker).name === "string"
  );
}

/** One line per item, stored as a single unnamed block. */
export function parseProgramText(text: string): ProgramBlock[] {
  const items = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return items.length > 0 ? [{ day: "Programme", items }] : [];
}

export function programToText(program: unknown): string {
  return parseProgram(program)
    .flatMap((block) => block.items)
    .join("\n");
}

/** One speaker per line: "Name | Title | Company" (title/company optional). */
export function parseSpeakersText(text: string): Speaker[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, title, company] = line.split("|").map((part) => part.trim());
      return { name, title: title || undefined, company: company || undefined };
    })
    .filter((s) => s.name);
}

export function speakersToText(speakers: unknown): string {
  return parseSpeakers(speakers)
    .map((s) => [s.name, s.title, s.company].filter(Boolean).join(" | "))
    .join("\n");
}
