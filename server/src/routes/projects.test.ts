import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { Request, Response } from "express";
import type { GeminiClient } from "../gemini/client.js";
import { createAppContext } from "../appContext.js";
import { openDatabase } from "../db/client.js";
import { sessionCookie } from "../http/sessionCookie.js";
import { createProjectRouter } from "./projects.js";

let db: Database.Database;
let tmpDir: string;
let previousDataDir: string | undefined;
let previousStaleStepMs: string | undefined;
let gemini: GeminiClient;

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: () => void) => void }>;
  };
}

beforeEach(() => {
  previousDataDir = process.env.DATA_DIR;
  previousStaleStepMs = process.env.STALE_STEP_MS;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-book-projects-"));
  process.env.DATA_DIR = path.join(tmpDir, "data");
  process.env.STALE_STEP_MS = "1800000";
  db = openDatabase(path.join(tmpDir, "test.db"));
  gemini = {
    async generateStyle() {
      return "Warm watercolor";
    },
    async generateCharacters() {
      return [
        { name: "Mira", prompt: "Adult lead in a warm watercolor style" },
        { name: "Jon", prompt: "Adult companion in a warm watercolor style" },
      ];
    },
    async generatePortrait() {
      return Buffer.from("fake-png");
    },
    async generateChapters() {
      return [{ title: "Opening Scene", prompt: "A river scene with Mira and Jon" }];
    },
    async generateIllustration() {
      return Buffer.from("fake-illustration");
    },
  };
});

afterEach(() => {
  db?.close();
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = previousDataDir;
  }
  if (previousStaleStepMs === undefined) {
    delete process.env.STALE_STEP_MS;
  } else {
    process.env.STALE_STEP_MS = previousStaleStepMs;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function routeHandler(method: "get" | "post", routePath = "/") {
  const router = createProjectRouter(createAppContext(db, gemini));
  const layer = (router.stack as RouteLayer[]).find(
    (item) => item.route?.path === routePath && item.route.methods[method],
  );

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error(`Could not find ${method.toUpperCase()} ${routePath} projects route.`);
  }

  return layer.route.stack[0].handle;
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };

  return response;
}

function signedInUser() {
  const context = createAppContext(db, gemini);
  return context.users.createOrUpdateByEmail({
    name: "Mira",
    email: "mira@example.com",
  });
}

function createProjectReadyForChapters(userId: string) {
  const context = createAppContext(db, gemini);
  const project = context.projects.create({
    userId,
    title: "The River Book",
    bookPath: path.join("books", "project.txt"),
  });

  context.projects.saveStyle({ projectId: project.id, text: "Warm watercolor" });
  context.projects.setStepRunning({
    projectId: project.id,
    userId,
    step: "style",
    expectedStatus: "created",
  });
  context.projects.finishStep({
    projectId: project.id,
    userId,
    step: "style",
    nextStatus: "style_done",
  });
  context.projects.setStepRunning({
    projectId: project.id,
    userId,
    step: "characters",
    expectedStatus: "style_done",
  });
  context.projects.replaceCharacters({
    projectId: project.id,
    characters: [{ name: "Mira", prompt: "Adult lead", portraitPath: "images/mira.png" }],
  });
  context.projects.finishStep({
    projectId: project.id,
    userId,
    step: "characters",
    nextStatus: "characters_done",
  });
  context.projects.setStepRunning({
    projectId: project.id,
    userId,
    step: "portraits",
    expectedStatus: "characters_done",
  });
  const withCharacters = context.projects.findByIdForUser(project.id, userId);
  if (!withCharacters?.characters[0]) {
    throw new Error("Expected setup character.");
  }
  context.projects.setCharacterPortraitPath({
    characterId: withCharacters.characters[0].id,
    portraitPath: "images/mira.png",
  });
  context.projects.finishStep({
    projectId: project.id,
    userId,
    step: "portraits",
    nextStatus: "portraits_done",
  });

  return context.projects.findByIdForUser(project.id, userId);
}

describe("project routes", () => {
  it("requires a signed-in user for listing projects", () => {
    const handler = routeHandler("get");
    const res = createResponse();

    handler({ cookies: {} } as Request, res as unknown as Response, () => undefined);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Sign in before loading projects." });
  });

  it("lists projects for the signed-in user", () => {
    const user = signedInUser();
    const handler = routeHandler("get");
    const res = createResponse();

    handler(
      { cookies: { [sessionCookie]: user.id } } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ projects: [] });
  });

  it("creates a project and writes the book text file", () => {
    const user = signedInUser();
    const handler = routeHandler("post");
    const res = createResponse();

    handler(
      {
        cookies: { [sessionCookie]: user.id },
        body: {
          title: "The River Book",
          bookText: "Once upon a river.",
        },
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      project: {
        userId: user.id,
        title: "The River Book",
        status: "created",
        stepState: "idle",
      },
    });

    const body = res.body as { project: { bookPath: string } };
    expect(fs.readFileSync(path.join(tmpDir, "data", body.project.bookPath), "utf8")).toBe(
      "Once upon a river.",
    );
  });

  it("loads full project state with book text", () => {
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const project = context.projects.create({
      id: "project-1",
      userId: user.id,
      title: "The River Book",
      bookPath: path.join("books", "project-1.txt"),
    });
    fs.mkdirSync(path.join(process.env.DATA_DIR ?? "data", "books"), { recursive: true });
    fs.writeFileSync(
      path.join(process.env.DATA_DIR ?? "data", project.bookPath),
      "Once upon a river.",
      "utf8",
    );
    const handler = routeHandler("get", "/:projectId");
    const res = createResponse();

    handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id },
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      project: {
        id: project.id,
        title: "The River Book",
        bookText: "Once upon a river.",
      },
    });
  });

  it("does not load another user's project", () => {
    const user = signedInUser();
    const other = createAppContext(db, gemini).users.createOrUpdateByEmail({
      name: "Other",
      email: "other@example.com",
    });
    const project = createAppContext(db, gemini).projects.create({
      userId: other.id,
      title: "Hidden",
      bookPath: path.join("books", "hidden.txt"),
    });
    const handler = routeHandler("get", "/:projectId");
    const res = createResponse();

    handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id },
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Project not found." });
  });

  it("runs the style step and saves generated style", async () => {
    const user = signedInUser();
    const createHandler = routeHandler("post");
    const createRes = createResponse();
    createHandler(
      {
        cookies: { [sessionCookie]: user.id },
        body: { title: "The River Book", bookText: "Once upon a river." },
      } as unknown as Request,
      createRes as unknown as Response,
      () => undefined,
    );
    const created = createRes.body as { project: { id: string } };
    const styleHandler = routeHandler("post", "/:projectId/steps/style");
    const styleRes = createResponse();

    await styleHandler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: created.project.id },
        body: { style: "storybook" },
      } as unknown as Request,
      styleRes as unknown as Response,
      () => undefined,
    );

    expect(styleRes.statusCode).toBe(200);
    expect(styleRes.body).toMatchObject({
      project: {
        id: created.project.id,
        status: "style_done",
        stepState: "idle",
        runningStep: null,
        style: "Warm watercolor",
      },
    });
  });

  it("does not start style unless the project is in the created state", async () => {
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const project = context.projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: path.join("books", "project.txt"),
    });
    context.projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "style",
      expectedStatus: "created",
    });
    const handler = routeHandler("post", "/:projectId/steps/style");
    const res = createResponse();

    await handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id },
        body: {},
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      error: "Style step cannot be started from the current project state.",
      project: { stepState: "running", runningStep: "style" },
    });
  });

  it("marks the style step failed when generation fails", async () => {
    gemini = {
      async generateStyle() {
        throw new Error("Gemini unavailable");
      },
      async generateCharacters() {
        return [];
      },
      async generatePortrait() {
        return Buffer.from("fake-png");
      },
      async generateChapters() {
        return [];
      },
      async generateIllustration() {
        return Buffer.from("fake-illustration");
      },
    };
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const project = context.projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: path.join("books", "project.txt"),
    });
    fs.mkdirSync(path.join(process.env.DATA_DIR ?? "data", "books"), { recursive: true });
    fs.writeFileSync(path.join(process.env.DATA_DIR ?? "data", project.bookPath), "Text", "utf8");
    const handler = routeHandler("post", "/:projectId/steps/style");
    const res = createResponse();

    await handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id },
        body: {},
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({
      error: "Gemini unavailable",
      project: {
        status: "created",
        stepState: "failed",
        runningStep: "style",
        stepError: "Gemini unavailable",
      },
    });
  });

  it("runs the characters step and saves up to two adult characters", async () => {
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const project = context.projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: path.join("books", "project.txt"),
    });
    context.projects.saveStyle({ projectId: project.id, text: "Warm watercolor" });
    context.projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "style",
      expectedStatus: "created",
    });
    context.projects.finishStep({
      projectId: project.id,
      userId: user.id,
      step: "style",
      nextStatus: "style_done",
    });
    const handler = routeHandler("post", "/:projectId/steps/characters");
    const res = createResponse();

    await handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id },
        body: {},
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      project: {
        status: "characters_done",
        stepState: "idle",
        characters: [
          { name: "Mira", prompt: "Adult lead in a warm watercolor style" },
          { name: "Jon", prompt: "Adult companion in a warm watercolor style" },
        ],
      },
    });
  });

  it("runs the portraits step and persists each portrait path", async () => {
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const project = context.projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: path.join("books", "project.txt"),
    });
    context.projects.saveStyle({ projectId: project.id, text: "Warm watercolor" });
    context.projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "style",
      expectedStatus: "created",
    });
    context.projects.finishStep({
      projectId: project.id,
      userId: user.id,
      step: "style",
      nextStatus: "style_done",
    });
    context.projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "characters",
      expectedStatus: "style_done",
    });
    context.projects.replaceCharacters({
      projectId: project.id,
      characters: [{ name: "Mira", prompt: "Adult lead" }],
    });
    context.projects.finishStep({
      projectId: project.id,
      userId: user.id,
      step: "characters",
      nextStatus: "characters_done",
    });
    const handler = routeHandler("post", "/:projectId/steps/portraits");
    const res = createResponse();

    await handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id },
        body: {},
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      project: { status: string; characters: Array<{ portraitPath: string | null }> };
    };
    expect(body.project.status).toBe("portraits_done");
    expect(body.project.characters[0].portraitPath).toMatch(/^images\/.+\/.+\.png$/);
    expect(
      fs.readFileSync(
        path.join(process.env.DATA_DIR ?? "data", body.project.characters[0].portraitPath ?? ""),
        "utf8",
      ),
    ).toBe("fake-png");
  });

  it("runs the chapters step and saves one chapter prompt", async () => {
    const user = signedInUser();
    const project = createProjectReadyForChapters(user.id);
    if (!project) throw new Error("Expected project.");
    const handler = routeHandler("post", "/:projectId/steps/chapters");
    const res = createResponse();

    await handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id },
        body: {},
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      project: {
        status: "chapters_done",
        stepState: "idle",
        chapters: [{ title: "Opening Scene", prompt: "A river scene with Mira and Jon" }],
      },
    });
  });

  it("runs the illustrations step and persists the chapter illustration", async () => {
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const ready = createProjectReadyForChapters(user.id);
    if (!ready) throw new Error("Expected project.");
    context.projects.setStepRunning({
      projectId: ready.id,
      userId: user.id,
      step: "chapters",
      expectedStatus: "portraits_done",
    });
    context.projects.replaceChapters({
      projectId: ready.id,
      chapters: [{ title: "Opening Scene", prompt: "A river scene with Mira" }],
    });
    context.projects.finishStep({
      projectId: ready.id,
      userId: user.id,
      step: "chapters",
      nextStatus: "chapters_done",
    });
    const handler = routeHandler("post", "/:projectId/steps/illustrations");
    const res = createResponse();

    await handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: ready.id },
        body: {},
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      project: { status: string; chapters: Array<{ illustrationPath: string | null }> };
    };
    expect(body.project.status).toBe("done");
    expect(body.project.chapters[0].illustrationPath).toMatch(/^images\/.+\/.+\.png$/);
    expect(
      fs.readFileSync(
        path.join(process.env.DATA_DIR ?? "data", body.project.chapters[0].illustrationPath ?? ""),
        "utf8",
      ),
    ).toBe("fake-illustration");
  });

  it("clears a failed step for retry", () => {
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const project = context.projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: path.join("books", "project.txt"),
    });
    context.projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "style",
      expectedStatus: "created",
    });
    context.projects.failStep({
      projectId: project.id,
      userId: user.id,
      step: "style",
      error: "Gemini failed",
    });
    const handler = routeHandler("post", "/:projectId/steps/:step/retry");
    const res = createResponse();

    handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id, step: "style" },
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      project: {
        status: "created",
        stepState: "idle",
        runningStep: null,
        stepError: null,
      },
    });
  });

  it("does not clear a fresh running step for retry", () => {
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const project = context.projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: path.join("books", "project.txt"),
    });
    context.projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "style",
      expectedStatus: "created",
      now: new Date().toISOString(),
    });
    const handler = routeHandler("post", "/:projectId/steps/:step/retry");
    const res = createResponse();

    handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id, step: "style" },
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      error: "Step is not failed or stale enough to retry.",
      project: { stepState: "running", runningStep: "style" },
    });
  });

  it("clears a stale running step for retry", () => {
    process.env.STALE_STEP_MS = "1";
    const user = signedInUser();
    const context = createAppContext(db, gemini);
    const project = context.projects.create({
      userId: user.id,
      title: "The River Book",
      bookPath: path.join("books", "project.txt"),
    });
    context.projects.setStepRunning({
      projectId: project.id,
      userId: user.id,
      step: "style",
      expectedStatus: "created",
      now: "2026-08-14T00:00:00.000Z",
    });
    const handler = routeHandler("post", "/:projectId/steps/:step/retry");
    const res = createResponse();

    handler(
      {
        cookies: { [sessionCookie]: user.id },
        params: { projectId: project.id, step: "style" },
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      project: {
        status: "created",
        stepState: "idle",
        runningStep: null,
      },
    });
  });

  it("rejects project creation without title or book text", () => {
    const user = signedInUser();
    const handler = routeHandler("post");
    const res = createResponse();

    handler(
      {
        cookies: { [sessionCookie]: user.id },
        body: { title: "", bookText: "" },
      } as unknown as Request,
      res as unknown as Response,
      () => undefined,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Give the project a title and book text." });
  });
});
