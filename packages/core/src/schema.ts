/**
 * Colaborate database models — single source of truth.
 *
 * Used by:
 * - CLI to generate Prisma schema (via prisma-ast)
 * - Adapter for Zod validation
 * - Type exports
 *
 * This is a TS representation, NOT a .prisma file.
 * The CLI generates the actual Prisma schema from this definition.
 */

/** Definition of a single field in a Colaborate database model. */
export interface FieldDef {
  type: string;
  default?: string;
  optional?: boolean;
  relation?: {
    kind: "1-to-many" | "many-to-1";
    model: string;
    fields?: string[];
    references?: string[];
    onDelete?: string;
  };
  isId?: boolean;
  isUnique?: boolean;
  /** Prisma native type attribute (e.g. "Text" for @db.Text) — used for MySQL compatibility on long strings */
  nativeType?: string;
  /** Prisma @updatedAt attribute */
  isUpdatedAt?: boolean;
}

/** Definition of a composite index on a Colaborate database model. */
export interface IndexDef {
  fields: string[];
}

/** Definition of a single Colaborate database model (fields + indexes). */
export interface ModelDef {
  fields: Record<string, FieldDef>;
  indexes?: IndexDef[];
}

const _COLABORATE_MODELS = {
  ColaborateFeedback: {
    fields: {
      id: { type: "String", isId: true, default: "cuid()" },
      projectName: { type: "String" },
      type: { type: "String" },
      message: { type: "String", nativeType: "Text" },
      status: { type: "String", default: '"open"' },
      url: { type: "String" },
      viewport: { type: "String" },
      userAgent: { type: "String" },
      authorName: { type: "String" },
      authorEmail: { type: "String" },
      clientId: { type: "String", isUnique: true },
      resolvedAt: { type: "DateTime", optional: true },
      createdAt: { type: "DateTime", default: "now()" },
      updatedAt: { type: "DateTime", isUpdatedAt: true },
      sessionId: { type: "String", optional: true },
      session: {
        type: "ColaborateSession",
        optional: true,
        relation: {
          kind: "many-to-1",
          model: "ColaborateSession",
          fields: ["sessionId"],
          references: ["id"],
          onDelete: "SetNull",
        },
      },
      componentId: { type: "String", optional: true },
      sourceFile: { type: "String", optional: true, nativeType: "Text" },
      sourceLine: { type: "Int", optional: true },
      sourceColumn: { type: "Int", optional: true },
      mentions: { type: "String", default: '"[]"', nativeType: "Text" },
      externalProvider: { type: "String", optional: true },
      externalIssueId: { type: "String", optional: true },
      externalIssueUrl: { type: "String", optional: true, nativeType: "Text" },
      annotations: {
        type: "ColaborateAnnotation",
        relation: { kind: "1-to-many", model: "ColaborateAnnotation" },
      },
    },
    indexes: [
      { fields: ["projectName"] },
      { fields: ["projectName", "status", "createdAt"] },
      { fields: ["sessionId"] },
    ],
  },
  ColaborateAnnotation: {
    fields: {
      id: { type: "String", isId: true, default: "cuid()" },
      feedbackId: { type: "String" },
      feedback: {
        type: "ColaborateFeedback",
        relation: {
          kind: "many-to-1",
          model: "ColaborateFeedback",
          fields: ["feedbackId"],
          references: ["id"],
          onDelete: "Cascade",
        },
      },
      cssSelector: { type: "String", nativeType: "Text" },
      xpath: { type: "String", nativeType: "Text" },
      textSnippet: { type: "String", nativeType: "Text" },
      elementTag: { type: "String" },
      elementId: { type: "String", optional: true },
      textPrefix: { type: "String", nativeType: "Text" },
      textSuffix: { type: "String", nativeType: "Text" },
      fingerprint: { type: "String" },
      neighborText: { type: "String", nativeType: "Text" },
      shape: { type: "String" },
      geometry: { type: "String", nativeType: "Text" },
      scrollX: { type: "Float" },
      scrollY: { type: "Float" },
      viewportW: { type: "Int" },
      viewportH: { type: "Int" },
      devicePixelRatio: { type: "Float", default: "1" },
      createdAt: { type: "DateTime", default: "now()" },
    },
    indexes: [{ fields: ["feedbackId"] }],
  },
  ColaborateSession: {
    fields: {
      id: { type: "String", isId: true, default: "cuid()" },
      projectName: { type: "String" },
      reviewerName: { type: "String", optional: true },
      reviewerEmail: { type: "String", optional: true },
      status: { type: "String", default: '"drafting"' },
      submittedAt: { type: "DateTime", optional: true },
      triagedAt: { type: "DateTime", optional: true },
      notes: { type: "String", optional: true, nativeType: "Text" },
      createdAt: { type: "DateTime", default: "now()" },
      updatedAt: { type: "DateTime", isUpdatedAt: true },
      feedbacks: {
        type: "ColaborateFeedback",
        relation: { kind: "1-to-many", model: "ColaborateFeedback" },
      },
    },
    indexes: [{ fields: ["projectName", "status"] }],
  },
} as const satisfies Record<string, ModelDef>;

export const COLABORATE_MODELS = Object.freeze(_COLABORATE_MODELS);
