import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDatabase } from "./client.js";
import { createProjectsRepository } from "./projectsRepository.js";
import { createUsersRepository } from "./usersRepository.js";

let db: Database.Database;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-book-db-"));
  db = openDatabase(path.join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("users repository", () => {
  it("creates or updates a user by normalized email", () => {
    const users = createUsersRepository(db);

    const created = users.createOrUpdateByEmail({
      name: "Mira Hassan",
      email: "MIRA@example.com",
      now: "2026-08-14T00:00:00.000Z"
    });
    const updated = users.createOrUpdateByEmail({
      name: "Mira H.",
      email: "mira@example.com",
      now: "2026-08-15T00:00:00.000Z"
    });

    expect(updated.id).toBe(created.id);
    expect(updated.email).toBe("mira@example.com");
    expect(updated.name).toBe("Mira H.");
    expect(updated.createdAt).toBe(created.createdAt);
  });
});

describe("projects repository", () => {
  it("creates, lists, and hydrates project data", () => {
    const users = createUsersRepository(db);
    const projects = createProjectsRepository(db);
    const user = users.createOrUpdateByEmail({ name: "Mira", email: "mira@example.com" });
    const project = projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: "data/books/project.txt",
      now: "2026-08-14T00:00:00.000Z"
    });

    projects.saveStyle({ projectId: project.id, text: "Watercolor storybook" });
    projects.replaceCharacters({
      projectId: project.id,
      characters: [
        { name: "Character A", prompt: "Adult protagonist", portraitPath: "images/a.png" },
        { name: "Character B", prompt: "Adult companion" }
      ]
    });
    projects.replaceChapters({
      projectId: project.id,
      chapters: [{ title: "Opening Scene", prompt: "A calm river scene" }]
    });

    const [listed] = projects.listForUser(user.id);

    expect(listed).toMatchObject({
      id: project.id,
      userId: user.id,
      title: "The River Book",
      bookPath: "data/books/project.txt",
      status: "created",
      stepState: "idle",
      style: "Watercolor storybook"
    });
    expect(listed.characters).toHaveLength(2);
    expect(listed.characters[0]).toMatchObject({
      name: "Character A",
      portraitPath: "images/a.png",
      sortOrder: 0
    });
    expect(listed.chapters).toHaveLength(1);
    expect(listed.chapters[0]).toMatchObject({ title: "Opening Scene", sortOrder: 0 });
  });

  it("enforces character and chapter caps before writing", () => {
    const users = createUsersRepository(db);
    const projects = createProjectsRepository(db);
    const user = users.createOrUpdateByEmail({ name: "Mira", email: "mira@example.com" });
    const project = projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: "data/books/project.txt"
    });

    expect(() =>
      projects.replaceCharacters({
        projectId: project.id,
        characters: [
          { name: "A", prompt: "One" },
          { name: "B", prompt: "Two" },
          { name: "C", prompt: "Three" }
        ]
      })
    ).toThrow("at most 2");

    expect(() =>
      projects.replaceChapters({
        projectId: project.id,
        chapters: [
          { title: "One", prompt: "First" },
          { title: "Two", prompt: "Second" }
        ]
      })
    ).toThrow("at most 1");
  });

  it("atomically marks a step running only once", () => {
    const users = createUsersRepository(db);
    const projects = createProjectsRepository(db);
    const user = users.createOrUpdateByEmail({ name: "Mira", email: "mira@example.com" });
    const project = projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: "data/books/project.txt"
    });

    const first = projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "style",
      expectedStatus: "created",
      now: "2026-08-14T00:00:00.000Z"
    });
    const second = projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "style",
      expectedStatus: "created",
      now: "2026-08-14T00:00:01.000Z"
    });

    const reloaded = projects.findByIdForUser(project.id, user.id);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(reloaded).toMatchObject({
      stepState: "running",
      runningStep: "style",
      stepStartedAt: "2026-08-14T00:00:00.000Z"
    });
  });
});
