import type Database from "better-sqlite3";
import { openDatabase } from "./db/client.js";
import { createProjectsRepository } from "./db/projectsRepository.js";
import { createUsersRepository } from "./db/usersRepository.js";
import { createGeminiClient, type GeminiClient } from "./gemini/client.js";
import { createPipelineService } from "./pipeline/pipelineService.js";

export function createAppContext(
  db: Database.Database = openDatabase(),
  gemini: GeminiClient = createGeminiClient(),
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
