import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncPrismaModels } from "../../src/generators/prisma.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINIMAL_SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
`;

/** A schema that already has the ColaborateFeedback model (but incomplete). */
const SCHEMA_WITH_PARTIAL_MODEL = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model ColaborateFeedback {
  id          String   @id @default(cuid())
  projectName String
  type        String
  message     String
  createdAt   DateTime @default(now())
}
`;

/** A schema that has an existing User model. */
const SCHEMA_WITH_USER_MODEL = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id    String @id @default(cuid())
  email String @unique
  name  String
}
`;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("syncPrismaModels", () => {
  let tmpDir: string;
  let schemaPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "colaborate-test-"));
    schemaPath = join(tmpDir, "schema.prisma");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("throws when schema file does not exist", () => {
    expect(() => syncPrismaModels(join(tmpDir, "nonexistent.prisma"))).toThrow("Schema file not found");
  });

  // -----------------------------------------------------------------------
  // Adding models to an empty schema
  // -----------------------------------------------------------------------

  it("adds ColaborateFeedback + ColaborateAnnotation + ColaborateSession to an empty schema", () => {
    writeFileSync(schemaPath, MINIMAL_SCHEMA);

    const result = syncPrismaModels(schemaPath);

    expect(result.addedModels).toContain("ColaborateFeedback");
    expect(result.addedModels).toContain("ColaborateAnnotation");
    expect(result.addedModels).toContain("ColaborateSession");
    expect(result.changes).toHaveLength(0);

    const output = readFileSync(schemaPath, "utf-8");
    expect(output).toContain("model ColaborateFeedback");
    expect(output).toContain("model ColaborateAnnotation");
    expect(output).toContain("model ColaborateSession");

    // ColaborateFeedback — new fields added in Phase 1b
    expect(output).toMatch(/sessionId\s+String\?/);
    expect(output).toMatch(/componentId\s+String\?/);
    expect(output).toMatch(/sourceFile\s+String\?/);
    expect(output).toMatch(/sourceLine\s+Int\?/);
    expect(output).toMatch(/sourceColumn\s+Int\?/);
    expect(output).toMatch(/mentions\s+String/); // not nullable — has default "[]"
    expect(output).toMatch(/externalProvider\s+String\?/);
    expect(output).toMatch(/externalIssueId\s+String\?/);
    expect(output).toMatch(/externalIssueUrl\s+String\?/);

    // ColaborateSession — fields + @@index
    expect(output).toMatch(/model ColaborateSession\s*{[\s\S]*?projectName\s+String/);
    expect(output).toMatch(/model ColaborateSession\s*{[\s\S]*?status\s+String/);
    expect(output).toMatch(/@@index\(\[projectName, status\]\)/);

    // ColaborateFeedback sessionId index
    expect(output).toMatch(/@@index\(\[sessionId\]\)/);
  });

  it("preserves existing datasource and generator blocks", () => {
    writeFileSync(schemaPath, MINIMAL_SCHEMA);

    syncPrismaModels(schemaPath);

    const output = readFileSync(schemaPath, "utf-8");
    expect(output).toContain("datasource db");
    expect(output).toContain('provider = "postgresql"');
    expect(output).toContain("generator client");
  });

  // -----------------------------------------------------------------------
  // Adding models alongside existing models
  // -----------------------------------------------------------------------

  it("adds Colaborate models alongside an existing User model", () => {
    writeFileSync(schemaPath, SCHEMA_WITH_USER_MODEL);

    const result = syncPrismaModels(schemaPath);

    expect(result.addedModels).toContain("ColaborateFeedback");
    expect(result.addedModels).toContain("ColaborateAnnotation");

    const output = readFileSync(schemaPath, "utf-8");
    // User model should still be there
    expect(output).toContain("model User");
    expect(output).toContain("model ColaborateFeedback");
    expect(output).toContain("model ColaborateAnnotation");
  });

  // -----------------------------------------------------------------------
  // Updating fields when schema is outdated
  // -----------------------------------------------------------------------

  it("adds missing fields to an existing partial model", () => {
    writeFileSync(schemaPath, SCHEMA_WITH_PARTIAL_MODEL);

    const result = syncPrismaModels(schemaPath);

    // ColaborateFeedback already existed, so it shouldn't be in addedModels
    expect(result.addedModels).not.toContain("ColaborateFeedback");
    // But ColaborateAnnotation is new
    expect(result.addedModels).toContain("ColaborateAnnotation");

    // Should have field-level changes for the missing fields
    expect(result.changes.length).toBeGreaterThan(0);
    const addedFieldNames = result.changes
      .filter((c) => c.action === "added" && c.model === "ColaborateFeedback")
      .map((c) => c.field);

    // These fields exist in COLABORATE_MODELS but not in the partial schema
    expect(addedFieldNames).toContain("status");
    expect(addedFieldNames).toContain("url");
    expect(addedFieldNames).toContain("viewport");
    expect(addedFieldNames).toContain("userAgent");
    expect(addedFieldNames).toContain("authorName");
    expect(addedFieldNames).toContain("authorEmail");
    expect(addedFieldNames).toContain("clientId");
    expect(addedFieldNames).toContain("annotations");

    // Verify the output contains the new fields
    const output = readFileSync(schemaPath, "utf-8");
    expect(output).toContain("clientId");
    expect(output).toContain("@unique");
    expect(output).toContain("authorEmail");
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------

  it("running sync twice produces the same result (idempotent)", () => {
    writeFileSync(schemaPath, MINIMAL_SCHEMA);

    // First sync
    syncPrismaModels(schemaPath);
    const firstOutput = readFileSync(schemaPath, "utf-8");

    // Second sync — should produce no changes
    const result2 = syncPrismaModels(schemaPath);
    const secondOutput = readFileSync(schemaPath, "utf-8");

    expect(result2.addedModels).toHaveLength(0);
    expect(result2.changes).toHaveLength(0);
    expect(secondOutput).toBe(firstOutput);
  });

  it("running sync twice on a partial schema is idempotent after first sync", () => {
    writeFileSync(schemaPath, SCHEMA_WITH_PARTIAL_MODEL);

    // First sync — adds missing fields
    const result1 = syncPrismaModels(schemaPath);
    expect(result1.changes.length).toBeGreaterThan(0);
    const firstOutput = readFileSync(schemaPath, "utf-8");

    // Second sync — no changes
    const result2 = syncPrismaModels(schemaPath);
    const secondOutput = readFileSync(schemaPath, "utf-8");

    expect(result2.addedModels).toHaveLength(0);
    expect(result2.changes).toHaveLength(0);
    expect(secondOutput).toBe(firstOutput);
  });

  // -----------------------------------------------------------------------
  // Schema integrity checks
  // -----------------------------------------------------------------------

  it("generates correct field attributes (id, default, unique)", () => {
    writeFileSync(schemaPath, MINIMAL_SCHEMA);

    syncPrismaModels(schemaPath);

    const output = readFileSync(schemaPath, "utf-8");

    // ID field with @id and @default(cuid())
    expect(output).toMatch(/id\s+String\s+@id\s+@default\(cuid\(\)\)/);
    // clientId with @unique
    expect(output).toMatch(/clientId\s+String\s+@unique/);
    // Optional field: resolvedAt DateTime?
    expect(output).toMatch(/resolvedAt\s+DateTime\?/);
    // createdAt with @default(now())
    expect(output).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
  });

  // -----------------------------------------------------------------------
  // Native type attributes (@db.Text)
  // -----------------------------------------------------------------------

  it("adds @db.Text to fields with nativeType: 'Text' on fresh schema", () => {
    writeFileSync(schemaPath, MINIMAL_SCHEMA);

    syncPrismaModels(schemaPath);

    const output = readFileSync(schemaPath, "utf-8");

    // ColaborateFeedback.message should have @db.Text
    expect(output).toMatch(/message\s+String\s+@db\.Text/);
    // ColaborateAnnotation fields with nativeType: "Text"
    expect(output).toMatch(/cssSelector\s+String\s+@db\.Text/);
    expect(output).toMatch(/xpath\s+String\s+@db\.Text/);
    expect(output).toMatch(/textSnippet\s+String\s+@db\.Text/);
    expect(output).toMatch(/textPrefix\s+String\s+@db\.Text/);
    expect(output).toMatch(/textSuffix\s+String\s+@db\.Text/);
    expect(output).toMatch(/neighborText\s+String\s+@db\.Text/);
    // Fields without nativeType should NOT have @db.Text
    expect(output).not.toMatch(/projectName\s+String\s+@db\.Text/);
    expect(output).not.toMatch(/elementTag\s+String\s+@db\.Text/);
  });

  it("adds @db.Text when updating an existing field missing the attribute", () => {
    writeFileSync(schemaPath, SCHEMA_WITH_PARTIAL_MODEL);

    const result = syncPrismaModels(schemaPath);

    const output = readFileSync(schemaPath, "utf-8");

    // message existed but without @db.Text — should be updated
    const messageChange = result.changes.find((c) => c.model === "ColaborateFeedback" && c.field === "message");
    expect(messageChange).toBeDefined();
    expect(messageChange!.action).toBe("updated");
    expect(messageChange!.detail).toContain("+@db.Text");

    // After sync, the field should have @db.Text
    expect(output).toMatch(/message\s+String\s+@db\.Text/);
  });

  it("generates correct relation fields", () => {
    writeFileSync(schemaPath, MINIMAL_SCHEMA);

    syncPrismaModels(schemaPath);

    const output = readFileSync(schemaPath, "utf-8");

    // ColaborateFeedback has a 1-to-many relation to annotations
    expect(output).toMatch(/annotations\s+ColaborateAnnotation\[\]/);

    // ColaborateAnnotation has feedback relation with references
    expect(output).toContain("@relation");
    expect(output).toContain("onDelete: Cascade");
  });

  it("returns the schemaPath in the result", () => {
    writeFileSync(schemaPath, MINIMAL_SCHEMA);

    const result = syncPrismaModels(schemaPath);
    expect(result.schemaPath).toBe(schemaPath);
  });

  it("does not modify schema file when no changes needed", () => {
    writeFileSync(schemaPath, MINIMAL_SCHEMA);

    // First sync writes the models
    syncPrismaModels(schemaPath);

    // Get mtime before second sync
    const { mtimeMs: mtimeBefore } = require("node:fs").statSync(schemaPath);

    // Second sync should not write (no changes)
    syncPrismaModels(schemaPath);
    const { mtimeMs: mtimeAfter } = require("node:fs").statSync(schemaPath);

    // File should not have been written to
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
