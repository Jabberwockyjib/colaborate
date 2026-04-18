import { MemoryStore } from "@colaborate/adapter-memory";

const RESET_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Singleton — survives Next.js hot reloads in dev
const g = globalThis as typeof globalThis & { __colaborateStore?: MemoryStore };
if (!g.__colaborateStore) {
  g.__colaborateStore = new MemoryStore();
  setInterval(() => g.__colaborateStore?.clear(), RESET_INTERVAL_MS);
}

export const memoryStore = g.__colaborateStore;
