import type Database from "better-sqlite3";
import path from "node:path";
import { openDatabase } from "./db/client.js";
import { createProjectsRepository } from "./db/projectsRepository.js";
import { createUsersRepository } from "./db/usersRepository.js";
import {
  createGeminiClient,
  type GeminiClient,
  type GeminiFileStore,
} from "./gemini/client.js";
import { createFakeGeminiClient } from "./gemini/fakeClient.js";
import { createPipelineService } from "./pipeline/pipelineService.js";

export function createConfiguredGeminiClient(fileStore?: GeminiFileStore): GeminiClient {
  const mode = process.env.GEMINI_MODE ?? "real";
  if (mode === "mock") return createFakeGeminiClient();
  if (mode === "real") return createGeminiClient({ fileStore });
  throw new Error(`Unsupported GEMINI_MODE: ${mode}`);
}

export function createAppContext(
  db: Database.Database = openDatabase(),
  gemini?: GeminiClient,
) {
  const projects = createProjectsRepository(db);
  const dataDirectory = path.resolve(process.env.DATA_DIR ?? "data");
  const storedBookPath = (bookPath: string) => path.relative(dataDirectory, bookPath);
  const fileStore: GeminiFileStore = {
    get(bookPath) {
      return projects.getGeminiFileReference(storedBookPath(bookPath));
    },
    save(bookPath, file) {
      projects.saveGeminiFileReference({ bookPath: storedBookPath(bookPath), ...file });
    },
  };

  return {
    db,
    users: createUsersRepository(db),
    projects,
    pipeline: createPipelineService(projects),
    gemini: gemini ?? createConfiguredGeminiClient(fileStore),
  };
}

export type AppContext = ReturnType<typeof createAppContext>;
