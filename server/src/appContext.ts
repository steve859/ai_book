import type Database from "better-sqlite3";
import { openDatabase } from "./db/client.js";
import { createProjectsRepository } from "./db/projectsRepository.js";
import { createUsersRepository } from "./db/usersRepository.js";
import { createGeminiClient, type GeminiClient } from "./gemini/client.js";
import { createFakeGeminiClient } from "./gemini/fakeClient.js";
import { createPipelineService } from "./pipeline/pipelineService.js";

export function createConfiguredGeminiClient(): GeminiClient {
  const mode = process.env.GEMINI_MODE ?? "real";
  if (mode === "mock") return createFakeGeminiClient();
  if (mode === "real") return createGeminiClient();
  throw new Error(`Unsupported GEMINI_MODE: ${mode}`);
}

export function createAppContext(
  db: Database.Database = openDatabase(),
  gemini: GeminiClient = createConfiguredGeminiClient(),
) {
  const projects = createProjectsRepository(db);

  return {
    db,
    users: createUsersRepository(db),
    projects,
    pipeline: createPipelineService(projects),
    gemini,
  };
}

export type AppContext = ReturnType<typeof createAppContext>;
