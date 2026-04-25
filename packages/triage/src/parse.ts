import * as zod from "zod";

// Same dual-CJS/ESM Zod workaround as the rest of the repo (see adapter-prisma/src/validation.ts).
const z: typeof zod.z = ("z" in zod ? zod.z : zod) as typeof zod.z;

/**
 * Validated shape of a single issue emitted by the triage LLM.
 */
export interface IssueDraft {
  title: string;
  body: string;
  labels?: string[];
  componentId?: string;
  sourceFile?: string;
  relatedFeedbackIds: string[];
}

const issueSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  labels: z.array(z.string().min(1).max(50)).max(20).optional(),
  componentId: z.string().min(1).max(200).optional(),
  sourceFile: z.string().min(1).max(2000).optional(),
  relatedFeedbackIds: z.array(z.string().min(1)).min(1),
});
const issuesSchema = z.array(issueSchema).min(1);

/**
 * Raised when the LLM output cannot be parsed into a valid issue array.
 * Carries the raw text so the caller can persist it into `failureReason` for debugging.
 */
export class TriageParseError extends Error {
  readonly rawText: string;
  constructor(message: string, rawText: string) {
    super(message);
    this.name = "TriageParseError";
    this.rawText = rawText;
  }
}

/**
 * Raised when the parsed issues don't form an exact partition of the input feedbackIds —
 * either an id is dropped, duplicated, or unknown.
 */
export class TriageCoverageError extends Error {
  readonly rawText: string;
  constructor(message: string, rawText: string) {
    super(message);
    this.name = "TriageCoverageError";
    this.rawText = rawText;
  }
}

/**
 * Parse the LLM output into a validated `IssueDraft[]`.
 *
 * Steps:
 *   1. Strip prose / markdown fences using the outermost `[...]` extractor.
 *   2. JSON.parse — wrap failure in TriageParseError.
 *   3. Zod validation against issueSchema array — wrap in TriageParseError.
 *   4. Coverage check: every `knownFeedbackIds` entry appears in exactly one issue's
 *      `relatedFeedbackIds`, and no foreign id leaks in. Wrap in TriageCoverageError.
 */
export function parseTriageOutput(text: string, knownFeedbackIds: readonly string[]): IssueDraft[] {
  const arrayText = extractOutermostArray(text);
  if (!arrayText) {
    throw new TriageParseError("LLM output contains no JSON array", text);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TriageParseError(`JSON.parse failed: ${msg}`, text);
  }
  const result = issuesSchema.safeParse(parsed);
  if (!result.success) {
    throw new TriageParseError(
      `LLM output failed schema validation: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      text,
    );
  }
  const issues = result.data as IssueDraft[];

  // Coverage check
  const seen = new Set<string>();
  const known = new Set(knownFeedbackIds);
  const dups: string[] = [];
  const unknownIds: string[] = [];
  for (const issue of issues) {
    for (const id of issue.relatedFeedbackIds) {
      if (!known.has(id)) {
        unknownIds.push(id);
        continue;
      }
      if (seen.has(id)) {
        dups.push(id);
        continue;
      }
      seen.add(id);
    }
  }
  const dropped = [...known].filter((id) => !seen.has(id));
  if (dropped.length || dups.length || unknownIds.length) {
    const parts: string[] = [];
    if (dropped.length) parts.push(`dropped: [${dropped.join(", ")}]`);
    if (dups.length) parts.push(`duplicated: [${dups.join(", ")}]`);
    if (unknownIds.length) parts.push(`unknown: [${unknownIds.join(", ")}]`);
    throw new TriageCoverageError(`LLM output does not partition input feedbackIds — ${parts.join("; ")}`, text);
  }

  return issues;
}

/** Find the outermost `[...]` array in arbitrary text, returning the raw substring or null. */
function extractOutermostArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  // Scan forward, tracking depth, ignoring brackets inside strings.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i] ?? "";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
