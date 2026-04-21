import type { MemoryStore } from "@colaborate/adapter-memory";
import type { AnnotationCreateInput, FeedbackStatus, SessionRecord } from "@colaborate/core";

const annotation: AnnotationCreateInput = {
  cssSelector: "main > h1",
  xpath: "/html/body/main/h1",
  textSnippet: "Checkout",
  elementTag: "H1",
  elementId: undefined,
  textPrefix: "Welcome",
  textSuffix: "Please continue",
  fingerprint: "1:0:abc",
  neighborText: "Payment",
  shape: "rectangle",
  geometry: JSON.stringify({ shape: "rectangle", x: 0.1, y: 0.2, w: 0.3, h: 0.4 }),
  scrollX: 0,
  scrollY: 0,
  viewportW: 1280,
  viewportH: 720,
  devicePixelRatio: 1,
};

export interface SeedResult {
  projectName: string;
  draftingSession: SessionRecord;
  submittedSession: SessionRecord;
  /** clientId → intended role in the fixture, for readable assertions. */
  feedbackClientIds: {
    openNoSession: string;
    draftInDrafting: string;
    draftInSubmitted: string;
    resolvedWithComponent: string;
  };
}

/**
 * Seeds a MemoryStore with a deterministic mix:
 *  - 2 sessions (one drafting, one submitted)
 *  - 4 feedbacks:
 *    - open, no session, no componentId
 *    - draft, linked to drafting session, componentId="CheckoutButton"
 *    - draft, linked to submitted session (flipped to "open" by submit), componentId="CheckoutButton"
 *    - resolved, no session, componentId="NavBar"
 *
 * The fixture is large enough to exercise filter/grouping logic but deterministic
 * in ordering (MemoryStore uses unshift — latest first).
 */
export async function seedStore(store: MemoryStore): Promise<SeedResult> {
  const projectName = "test-project";
  const draftingSession = await store.createSession({ projectName, reviewerName: "Alice" });
  const submittedSession = await store.createSession({ projectName, reviewerName: "Bob" });

  const feedbackClientIds = {
    openNoSession: "fb-open",
    draftInDrafting: "fb-draft-drafting",
    draftInSubmitted: "fb-draft-submitted",
    resolvedWithComponent: "fb-resolved-nav",
  };

  await store.createFeedback({
    projectName,
    type: "bug",
    message: "Header contrast is too low",
    status: "open" as FeedbackStatus,
    url: "https://example.com/",
    viewport: "1280x720",
    userAgent: "test",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    clientId: feedbackClientIds.openNoSession,
    annotations: [annotation],
  });

  await store.createFeedback({
    projectName,
    type: "change",
    message: "Checkout button should say 'Pay now'",
    status: "draft" as FeedbackStatus,
    url: "https://example.com/checkout",
    viewport: "1280x720",
    userAgent: "test",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    clientId: feedbackClientIds.draftInDrafting,
    sessionId: draftingSession.id,
    componentId: "CheckoutButton",
    annotations: [annotation],
  });

  await store.createFeedback({
    projectName,
    type: "bug",
    message: "Checkout button misaligned",
    status: "draft" as FeedbackStatus,
    url: "https://example.com/checkout",
    viewport: "1280x720",
    userAgent: "test",
    authorName: "Bob",
    authorEmail: "bob@example.com",
    clientId: feedbackClientIds.draftInSubmitted,
    sessionId: submittedSession.id,
    componentId: "CheckoutButton",
    annotations: [annotation],
  });

  // Submit flips all drafts in submittedSession to "open".
  const submitted = await store.submitSession(submittedSession.id);

  await store.createFeedback({
    projectName,
    type: "other",
    message: "Nav link color clashes",
    status: "resolved" as FeedbackStatus,
    url: "https://example.com/",
    viewport: "1280x720",
    userAgent: "test",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    clientId: feedbackClientIds.resolvedWithComponent,
    componentId: "NavBar",
    annotations: [annotation],
  });

  return {
    projectName,
    draftingSession,
    submittedSession: submitted,
    feedbackClientIds,
  };
}
