import { describe, expect, it } from "vitest";
import { parseTriageOutput, TriageCoverageError, TriageParseError } from "../src/parse.js";

const KNOWN_IDS = ["fb-1", "fb-2", "fb-3"];

describe("parseTriageOutput", () => {
  it("accepts clean JSON array", () => {
    const text = JSON.stringify([
      { title: "Fix A", body: "B", relatedFeedbackIds: ["fb-1", "fb-2"] },
      { title: "Fix B", body: "C", relatedFeedbackIds: ["fb-3"] },
    ]);
    const issues = parseTriageOutput(text, KNOWN_IDS);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.title).toBe("Fix A");
    expect(issues[0]!.relatedFeedbackIds).toEqual(["fb-1", "fb-2"]);
  });

  it("accepts markdown-fenced JSON", () => {
    const text =
      "```json\n" + JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: ["fb-1", "fb-2", "fb-3"] }]) + "\n```";
    const issues = parseTriageOutput(text, KNOWN_IDS);
    expect(issues).toHaveLength(1);
  });

  it("accepts JSON with prose preamble", () => {
    const text =
      "Here are the issues I extracted:\n\n" +
      JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: ["fb-1", "fb-2", "fb-3"] }]);
    const issues = parseTriageOutput(text, KNOWN_IDS);
    expect(issues).toHaveLength(1);
  });

  it("preserves optional labels / componentId / sourceFile", () => {
    const text = JSON.stringify([
      {
        title: "T",
        body: "B",
        labels: ["bug", "ui"],
        componentId: "PricingCard",
        sourceFile: "components/pricing/Card.tsx",
        relatedFeedbackIds: ["fb-1", "fb-2", "fb-3"],
      },
    ]);
    const [issue] = parseTriageOutput(text, KNOWN_IDS);
    expect(issue!.labels).toEqual(["bug", "ui"]);
    expect(issue!.componentId).toBe("PricingCard");
    expect(issue!.sourceFile).toBe("components/pricing/Card.tsx");
  });

  it("throws TriageParseError on malformed JSON", () => {
    expect(() => parseTriageOutput("{not json", KNOWN_IDS)).toThrow(TriageParseError);
  });

  it("throws TriageParseError when no array found in text", () => {
    expect(() => parseTriageOutput("Sorry, I can't help with that.", KNOWN_IDS)).toThrow(TriageParseError);
  });

  it("throws TriageParseError when issue is missing required fields", () => {
    const text = JSON.stringify([{ title: "no body or relatedFeedbackIds" }]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageParseError);
  });

  it("throws TriageParseError when relatedFeedbackIds is empty", () => {
    const text = JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: [] }]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageParseError);
  });

  it("throws TriageCoverageError when an input id is dropped", () => {
    const text = JSON.stringify([
      { title: "T", body: "B", relatedFeedbackIds: ["fb-1", "fb-2"] }, // missing fb-3
    ]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageCoverageError);
  });

  it("throws TriageCoverageError when an id is duplicated across issues", () => {
    const text = JSON.stringify([
      { title: "T1", body: "B", relatedFeedbackIds: ["fb-1", "fb-2"] },
      { title: "T2", body: "B", relatedFeedbackIds: ["fb-2", "fb-3"] }, // fb-2 dup
    ]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageCoverageError);
  });

  it("throws TriageCoverageError when an unknown id appears", () => {
    const text = JSON.stringify([{ title: "T", body: "B", relatedFeedbackIds: ["fb-1", "fb-2", "fb-3", "fb-99"] }]);
    expect(() => parseTriageOutput(text, KNOWN_IDS)).toThrow(TriageCoverageError);
  });

  it("TriageParseError carries raw text for debugging", () => {
    try {
      parseTriageOutput("nope", KNOWN_IDS);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TriageParseError);
      expect((err as TriageParseError).rawText).toBe("nope");
    }
  });
});
