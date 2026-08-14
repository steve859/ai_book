import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { Request, Response } from "express";
import { createAppContext } from "../appContext.js";
import { openDatabase } from "../db/client.js";
import { sessionCookie } from "../http/sessionCookie.js";
import { createProjectRouter } from "./projects.js";

let db: Database.Database;
let tmpDir: string;
let previousDataDir: string | undefined;

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: () => void) => void }>;
  };
}

beforeEach(() => {
  previousDataDir = process.env.DATA_DIR;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-book-projects-"));
  process.env.DATA_DIR = path.join(tmpDir, "data");
  db = openDatabase(path.join(tmpDir, "test.db"));
});

afterEach(() => {
  db?.close();
  if (previousDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = previousDataDir;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function routeHandler(method: "get" | "post", routePath = "/") {
  const router = createProjectRouter(createAppContext(db));
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
  const context = createAppContext(db);
  return context.users.createOrUpdateByEmail({
    name: "Mira",
    email: "mira@example.com",
  });
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
