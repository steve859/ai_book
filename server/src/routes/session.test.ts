import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { Request, Response } from "express";
import { createAppContext } from "../appContext.js";
import { openDatabase } from "../db/client.js";
import { createSessionRouter } from "./session.js";

let db: Database.Database;
let tmpDir: string;

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: () => void) => void }>;
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-book-session-"));
  db = openDatabase(path.join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function routeHandler(method: "post" | "delete") {
  const router = createSessionRouter(createAppContext(db));
  const layer = (router.stack as RouteLayer[]).find(
    (item) => item.route?.path === "/" && item.route.methods[method],
  );

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error(`Could not find ${method.toUpperCase()} / session route.`);
  }

  return layer.route.stack[0].handle;
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    cookies: new Map<string, unknown>(),
    clearedCookies: new Set<string>(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    cookie(name: string, value: unknown) {
      this.cookies.set(name, value);
      return this;
    },
    clearCookie(name: string) {
      this.clearedCookies.add(name);
      return this;
    },
    end() {
      return this;
    },
  };

  return response;
}

describe("session routes", () => {
  it("creates a session for a valid name and email", () => {
    const handler = routeHandler("post");
    const req = { body: { name: "Mira Hassan", email: "MIRA@example.com" } };
    const res = createResponse();

    handler(req as Request, res as unknown as Response, () => undefined);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      user: {
        name: "Mira Hassan",
        email: "mira@example.com",
      },
    });
    expect(res.cookies.get("ai_book_user_id")).toBeTypeOf("string");
  });

  it("rejects invalid session input", () => {
    const handler = routeHandler("post");
    const req = { body: { name: "", email: "not-an-email" } };
    const res = createResponse();

    handler(req as Request, res as unknown as Response, () => undefined);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Enter a name and valid email." });
    expect(res.cookies.size).toBe(0);
  });

  it("clears the session cookie on sign out", () => {
    const handler = routeHandler("delete");
    const res = createResponse();

    handler({} as Request, res as unknown as Response, () => undefined);

    expect(res.statusCode).toBe(204);
    expect(res.clearedCookies.has("ai_book_user_id")).toBe(true);
  });
});
