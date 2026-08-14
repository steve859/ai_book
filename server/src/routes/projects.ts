import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppContext } from "../appContext.js";
import { sessionCookie } from "../http/sessionCookie.js";

const createProjectSchema = z.object({
  title: z.string().trim().min(1),
  bookText: z.string().trim().min(1),
});

function dataPath(...parts: string[]) {
  return path.join(process.env.DATA_DIR ?? "data", ...parts);
}

export function createProjectRouter(context: AppContext) {
  const router = Router();

  router.get("/", (req, res) => {
    const userId = req.cookies?.[sessionCookie] as string | undefined;
    if (!userId || !context.users.findById(userId)) {
      res.status(401).json({ error: "Sign in before loading projects." });
      return;
    }

    res.json({ projects: context.projects.listForUser(userId) });
  });

  router.post("/", (req, res) => {
    const userId = req.cookies?.[sessionCookie] as string | undefined;
    if (!userId || !context.users.findById(userId)) {
      res.status(401).json({ error: "Sign in before creating a project." });
      return;
    }

    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Give the project a title and book text." });
      return;
    }

    const projectId = nanoid();
    const relativeBookPath = path.join("books", `${projectId}.txt`);
    const absoluteBookPath = dataPath("books", `${projectId}.txt`);

    fs.mkdirSync(path.dirname(absoluteBookPath), { recursive: true });
    fs.writeFileSync(absoluteBookPath, parsed.data.bookText, "utf8");

    const project = context.projects.create({
      id: projectId,
      userId,
      title: parsed.data.title,
      bookPath: relativeBookPath,
    });

    res.status(201).json({ project });
  });

  router.get("/:projectId", (_req, res) => {
    res.status(501).json({ error: "Project detail endpoint scaffolded but not implemented yet." });
  });

  router.post("/:projectId/steps/:step", (_req, res) => {
    res.status(501).json({ error: "Pipeline step endpoint scaffolded but not implemented yet." });
  });

  router.post("/:projectId/steps/:step/retry", (_req, res) => {
    res.status(501).json({ error: "Step retry endpoint scaffolded but not implemented yet." });
  });

  return router;
}
