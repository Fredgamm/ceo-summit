/**
 * Shared speaker parsing for Event.speakers (Json column) — used by the
 * member-facing detail page (E3-T02, read-only) and the admin form
 * (E3-T05, read/write). Kept in one place so both sides agree on the
 * shape.
 *
 * The admin form edits this as plain text (one line per speaker) rather
 * than a full block editor — deliberately simple, matching the backlog's
 * "Intervenants" bullet without inventing UI the backlog never asked for.
 *
 * Programme parsing (`parseProgram`/`parseProgramText`) lived here until
 * the 5 août 2026 agenda rework (E10) — `Event.program` (free JSON text)
 * is gone, replaced by structured `EventSession` rows (see
 * app/actions/admin-event-sessions.ts).
 */

export interface Speaker {
  name: string;
  title?: string;
  company?: string;
}

export function parseSpeakers(json: unknown): Speaker[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (s): s is Speaker => !!s && typeof s === "object" && typeof (s as Speaker).name === "string"
  );
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
