import { describe, expect, it } from "vitest";
import { EMPTY_MENTIONS, MENTION_KINDS, type Mention, parseMentions, serializeMentions } from "../src/mentions.js";

describe("MENTION_KINDS constant", () => {
  it("enumerates the two kinds", () => {
    expect(MENTION_KINDS).toEqual(["user", "component"]);
  });
});

describe("EMPTY_MENTIONS", () => {
  it("is the JSON string for an empty array", () => {
    expect(EMPTY_MENTIONS).toBe("[]");
    expect(parseMentions(EMPTY_MENTIONS)).toEqual([]);
  });
});

describe("serializeMentions / parseMentions round-trip", () => {
  const cases: Array<{ label: string; input: Mention[] }> = [
    { label: "empty", input: [] },
    { label: "single user", input: [{ kind: "user", handle: "alice" }] },
    {
      label: "mixed",
      input: [
        { kind: "user", handle: "alice" },
        { kind: "component", handle: "CheckoutButton" },
      ],
    },
  ];

  for (const { label, input } of cases) {
    it(`round-trips ${label}`, () => {
      const serialized = serializeMentions(input);
      expect(typeof serialized).toBe("string");
      const parsed = parseMentions(serialized);
      expect(parsed).toEqual(input);
    });
  }
});

describe("parseMentions validation", () => {
  it("throws on invalid JSON", () => {
    expect(() => parseMentions("not json")).toThrow();
  });

  it("throws when root is not an array", () => {
    expect(() => parseMentions(JSON.stringify({ kind: "user", handle: "a" }))).toThrow(/array/);
  });

  it("throws when an entry has unknown kind", () => {
    expect(() => parseMentions(JSON.stringify([{ kind: "group", handle: "a" }]))).toThrow(/kind/);
  });

  it("throws when an entry is missing handle", () => {
    expect(() => parseMentions(JSON.stringify([{ kind: "user" }]))).toThrow(/handle/);
  });

  it("throws when handle is empty string", () => {
    expect(() => parseMentions(JSON.stringify([{ kind: "user", handle: "" }]))).toThrow(/handle/);
  });
});

describe("serializeMentions", () => {
  it("serializes an empty array to '[]'", () => {
    expect(serializeMentions([])).toBe("[]");
  });
});
