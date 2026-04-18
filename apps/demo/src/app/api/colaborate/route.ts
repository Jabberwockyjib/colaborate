import { createColaborateHandler } from "@colaborate/adapter-prisma";
import { memoryStore } from "@/lib/memory-store";

export const { GET, POST, PATCH, DELETE, OPTIONS } = createColaborateHandler({
  store: memoryStore,
});
