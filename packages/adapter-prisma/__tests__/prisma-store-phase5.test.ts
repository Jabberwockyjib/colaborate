import { StoreNotFoundError, StoreValidationError } from "@colaborate/core";
import { describe, expect, it } from "vitest";
import { type ColaboratePrismaClient, PrismaStore } from "../src/index.js";

interface FakeSession {
  id: string;
  status: string;
  failureReason: string | null;
  triagedAt: Date | null;
}

interface FakeFeedback {
  id: string;
  externalProvider: string | null;
  externalIssueId: string | null;
  externalIssueUrl: string | null;
  annotations: unknown[];
}

type SeedingExtensions = {
  __seedSession(s: { id: string; status: string; failureReason?: string | null; triagedAt?: Date | null }): void;
  __seedFeedback(f: { id: string }): void;
};

function makeFakePrisma(): ColaboratePrismaClient & SeedingExtensions {
  const sessions = new Map<string, FakeSession>();
  const feedbacks = new Map<string, FakeFeedback>();
  return {
    colaborateFeedback: {
      create: async () => {
        throw new Error("not used in this test");
      },
      findMany: async () => [],
      findUnique: async () => null,
      update: async (args: unknown) => {
        const a = args as { where: { id: string }; data: Record<string, unknown> };
        const fb = feedbacks.get(a.where.id);
        if (!fb) {
          const e = new Error("not found") as Error & { code?: string };
          e.code = "P2025";
          throw e;
        }
        Object.assign(fb, a.data);
        return { ...fb, annotations: [] };
      },
      updateMany: async () => ({ count: 0 }),
      delete: async () => ({}),
      deleteMany: async () => ({}),
      count: async () => 0,
    },
    colaborateSession: {
      create: async () => {
        throw new Error("not used");
      },
      findUnique: async (args: unknown) => sessions.get((args as { where: { id: string } }).where.id) ?? null,
      findMany: async () => [],
      update: async (args: unknown) => {
        const a = args as { where: { id: string }; data: Record<string, unknown> };
        const s = sessions.get(a.where.id);
        if (!s) {
          const e = new Error("not found") as Error & { code?: string };
          e.code = "P2025";
          throw e;
        }
        Object.assign(s, a.data);
        return s;
      },
    },
    $transaction: async () => [],
    __seedSession(s) {
      sessions.set(s.id, {
        id: s.id,
        status: s.status,
        failureReason: s.failureReason ?? null,
        triagedAt: s.triagedAt ?? null,
      });
    },
    __seedFeedback(f) {
      feedbacks.set(f.id, {
        id: f.id,
        externalProvider: null,
        externalIssueId: null,
        externalIssueUrl: null,
        annotations: [],
      });
    },
  } as unknown as ColaboratePrismaClient & SeedingExtensions;
}

describe("PrismaStore Phase 5 methods", () => {
  it("setFeedbackExternalIssue persists fields", async () => {
    const prisma = makeFakePrisma();
    prisma.__seedFeedback({ id: "fb1" });
    const store = new PrismaStore(prisma);
    const updated = await store.setFeedbackExternalIssue("fb1", {
      provider: "github",
      issueId: "1",
      issueUrl: "https://x/1",
    });
    expect(updated.externalProvider).toBe("github");
    expect(updated.externalIssueUrl).toBe("https://x/1");
  });

  it("setFeedbackExternalIssue throws StoreNotFoundError on Prisma P2025", async () => {
    const prisma = makeFakePrisma();
    const store = new PrismaStore(prisma);
    await expect(
      store.setFeedbackExternalIssue("nope", {
        provider: "github",
        issueId: "1",
        issueUrl: "https://x",
      }),
    ).rejects.toThrow(StoreNotFoundError);
  });

  it("markSessionTriaged: submitted → triaged + clears failureReason", async () => {
    const prisma = makeFakePrisma();
    prisma.__seedSession({ id: "s1", status: "submitted", failureReason: "old reason" });
    const store = new PrismaStore(prisma);
    const triaged = await store.markSessionTriaged("s1");
    expect(triaged.status).toBe("triaged");
    expect(triaged.failureReason).toBeNull();
  });

  it("markSessionTriaged: throws StoreValidationError when status='drafting'", async () => {
    const prisma = makeFakePrisma();
    prisma.__seedSession({ id: "s1", status: "drafting" });
    const store = new PrismaStore(prisma);
    await expect(store.markSessionTriaged("s1")).rejects.toThrow(StoreValidationError);
  });

  it("markSessionFailed: submitted → failed + persists reason", async () => {
    const prisma = makeFakePrisma();
    prisma.__seedSession({ id: "s1", status: "submitted" });
    const store = new PrismaStore(prisma);
    const failed = await store.markSessionFailed("s1", "anthropic: 429");
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("anthropic: 429");
  });

  it("markSessionFailed: failed → failed permitted (retry-then-fail)", async () => {
    const prisma = makeFakePrisma();
    prisma.__seedSession({ id: "s1", status: "failed" });
    const store = new PrismaStore(prisma);
    const failed = await store.markSessionFailed("s1", "second");
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("second");
  });
});
