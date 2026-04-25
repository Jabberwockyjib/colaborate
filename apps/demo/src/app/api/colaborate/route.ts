import Anthropic from "@anthropic-ai/sdk";
import { createColaborateHandler } from "@colaborate/adapter-prisma";
import { createGitHubAdapter } from "@colaborate/integration-github";
import { InProcessEventBus, TriageWorker } from "@colaborate/triage";
import { memoryStore } from "@/lib/memory-store";

const trackerAdapter =
  process.env.GITHUB_TOKEN && process.env.COLABORATE_GITHUB_REPO
    ? createGitHubAdapter({
        token: process.env.GITHUB_TOKEN,
        repo: process.env.COLABORATE_GITHUB_REPO,
      })
    : undefined;

const triageBus = new InProcessEventBus();
const triageWorker =
  trackerAdapter && process.env.ANTHROPIC_API_KEY
    ? new TriageWorker({
        store: memoryStore,
        anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
        trackerAdapter,
        eventBus: triageBus,
        ...(process.env.COLABORATE_TRIAGE_MODEL ? { model: process.env.COLABORATE_TRIAGE_MODEL } : {}),
      })
    : undefined;

if (triageWorker) triageWorker.start();

export const { GET, POST, PATCH, DELETE, OPTIONS } = createColaborateHandler({
  store: memoryStore,
  eventBus: triageBus,
  ...(triageWorker ? { triage: triageWorker } : {}),
});
