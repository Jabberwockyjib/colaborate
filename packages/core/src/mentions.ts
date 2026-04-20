/**
 * Feedback mentions — `@` handles tagging users or components.
 *
 * Stored on `ColaborateFeedback.mentions` as a JSON-stringified array
 * (DB-agnostic, same pattern as `geometry`). Wire format is an array of
 * `Mention` objects; the handler serializes to a string before storage.
 */

export const MENTION_KINDS = ["user", "component"] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];

export interface Mention {
  kind: MentionKind;
  handle: string;
}

/** JSON string representing an empty mentions array. Use as the column default. */
export const EMPTY_MENTIONS = "[]";

/** Serialize to a compact JSON string for DB storage. */
export function serializeMentions(mentions: Mention[]): string {
  return JSON.stringify(mentions);
}

/**
 * Parse a mentions JSON string into a typed `Mention[]`.
 * Throws on malformed JSON, non-array root, unknown `kind`, or empty `handle`.
 */
export function parseMentions(raw: string): Mention[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid mentions JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Mentions must be an array");
  }
  return parsed.map((entry, i) => validateEntry(entry, i));
}

// -- internal ----------------------------------------------------------------

function validateEntry(entry: unknown, i: number): Mention {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`Mention[${i}] must be an object`);
  }
  const obj = entry as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string" || !(MENTION_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Mention[${i}] kind must be one of ${MENTION_KINDS.join(", ")} — got: ${String(kind)}`);
  }
  const handle = obj.handle;
  if (typeof handle !== "string" || handle.length === 0) {
    throw new Error(`Mention[${i}] handle must be a non-empty string`);
  }
  return { kind: kind as MentionKind, handle };
}
