import type Database from "better-sqlite3";
import { openDatabase } from "./db/client.js";
import { createProjectsRepository } from "./db/projectsRepository.js";
import { createUsersRepository } from "./db/usersRepository.js";

export function createAppContext(db: Database.Database = openDatabase()) {
  return {
    db,
    users: createUsersRepository(db),
    projects: createProjectsRepository(db),
  };
}

export type AppContext = ReturnType<typeof createAppContext>;
