import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppContext } from "../appContext.js";
import { sessionCookie } from "../http/sessionCookie.js";
import { isPipelineStep } from "../pipeline/steps.js";

const createProjectSchema = z.object({
  title: z.string().trim().min(1),
  bookText: z.string().trim().min(1),
});

const styleStepSchema = z.object({
  style: z.string().trim().optional(),
});

function dataPath(...parts: string[]) {
  return path.join(process.env.DATA_DIR ?? "data", ...parts);
}

function imagePath(projectId: string, filename: string) {
  return path.join("images", projectId, filename);
}

function writeImage(relativePath: string, bytes: Buffer) {
  const absolutePath = dataPath(relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, bytes);
}

function staleBeforeDate(now = new Date()) {
  const staleMs = Number(process.env.STALE_STEP_MS ?? 30 * 60 * 1000);
  return new Date(now.getTime() - staleMs).toISOString();
}

function requireUserId(req: { cookies?: Record<string, unknown> }, context: AppContext) {
  const userId = req.cookies?.[sessionCookie];
  if (typeof userId !== "string" || !context.users.findById(userId)) {
    return null;
  }

  return userId;
}

export function createProjectRouter(context: AppContext) {
  const router = Router();

  router.get("/", (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
      res.status(401).json({ error: "Sign in before loading projects." });
      return;
    }

    res.json({ projects: context.projects.listForUser(userId) });
  });

  router.post("/", (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
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

  router.get("/:projectId", (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
      res.status(401).json({ error: "Sign in before loading this project." });
      return;
    }

    const project = context.projects.findByIdForUser(req.params.projectId, userId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }

    let bookText = "";
    try {
      bookText = fs.readFileSync(dataPath(project.bookPath), "utf8");
    } catch {
      res.status(500).json({ error: "Project book text could not be loaded." });
      return;
    }

    res.json({ project: { ...project, bookText } });
  });

  router.post("/:projectId/steps/style", async (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
      res.status(401).json({ error: "Sign in before running a project step." });
      return;
    }

    const project = context.projects.findByIdForUser(req.params.projectId, userId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }

    const parsed = styleStepSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Style must be text when provided." });
      return;
    }

    const started = context.pipeline.startStep({
      projectId: project.id,
      userId,
      step: "style",
    });
    if (!started) {
      const current = context.projects.findByIdForUser(project.id, userId);
      res.status(409).json({
        error: "Style step cannot be started from the current project state.",
        project: current,
      });
      return;
    }

    try {
      const style = await context.gemini.generateStyle(
        dataPath(project.bookPath),
        parsed.data.style,
      );
      context.projects.saveStyle({ projectId: project.id, text: style });
      context.pipeline.finishStep({ projectId: project.id, userId, step: "style" });

      res.json({ project: context.projects.findByIdForUser(project.id, userId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Style generation failed.";
      context.pipeline.failStep({
        projectId: project.id,
        userId,
        step: "style",
        error: message,
      });
      res.status(502).json({
        error: message,
        project: context.projects.findByIdForUser(project.id, userId),
      });
    }
  });

  router.post("/:projectId/steps/characters", async (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
      res.status(401).json({ error: "Sign in before running a project step." });
      return;
    }

    const project = context.projects.findByIdForUser(req.params.projectId, userId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    if (!project.style) {
      res.status(409).json({ error: "Generate a style before extracting characters.", project });
      return;
    }

    const started = context.pipeline.startStep({
      projectId: project.id,
      userId,
      step: "characters",
    });
    if (!started) {
      res.status(409).json({
        error: "Characters step cannot be started from the current project state.",
        project: context.projects.findByIdForUser(project.id, userId),
      });
      return;
    }

    try {
      const characters = await context.gemini.generateCharacters({
        bookPath: dataPath(project.bookPath),
        style: project.style,
      });
      context.projects.replaceCharacters({
        projectId: project.id,
        characters: characters.slice(0, 2),
      });
      context.pipeline.finishStep({ projectId: project.id, userId, step: "characters" });

      res.json({ project: context.projects.findByIdForUser(project.id, userId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Character generation failed.";
      context.pipeline.failStep({
        projectId: project.id,
        userId,
        step: "characters",
        error: message,
      });
      res.status(502).json({
        error: message,
        project: context.projects.findByIdForUser(project.id, userId),
      });
    }
  });

  router.post("/:projectId/steps/portraits", async (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
      res.status(401).json({ error: "Sign in before running a project step." });
      return;
    }

    const project = context.projects.findByIdForUser(req.params.projectId, userId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    if (!project.style || project.characters.length === 0) {
      res.status(409).json({
        error: "Generate characters before creating portraits.",
        project,
      });
      return;
    }

    const started = context.pipeline.startStep({
      projectId: project.id,
      userId,
      step: "portraits",
    });
    if (!started) {
      res.status(409).json({
        error: "Portraits step cannot be started from the current project state.",
        project: context.projects.findByIdForUser(project.id, userId),
      });
      return;
    }

    try {
      for (const character of project.characters) {
        const bytes = await context.gemini.generatePortrait({
          characterName: character.name,
          prompt: character.prompt,
          style: project.style,
        });
        const relativePath = imagePath(project.id, `${character.id}.png`);
        writeImage(relativePath, bytes);
        context.projects.setCharacterPortraitPath({
          characterId: character.id,
          portraitPath: relativePath,
        });
      }

      context.pipeline.finishStep({ projectId: project.id, userId, step: "portraits" });
      res.json({ project: context.projects.findByIdForUser(project.id, userId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Portrait generation failed.";
      context.pipeline.failStep({
        projectId: project.id,
        userId,
        step: "portraits",
        error: message,
      });
      res.status(502).json({
        error: message,
        project: context.projects.findByIdForUser(project.id, userId),
      });
    }
  });

  router.post("/:projectId/steps/chapters", async (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
      res.status(401).json({ error: "Sign in before running a project step." });
      return;
    }

    const project = context.projects.findByIdForUser(req.params.projectId, userId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    if (!project.style || project.characters.length === 0) {
      res.status(409).json({
        error: "Generate portraits before creating chapter prompts.",
        project,
      });
      return;
    }

    const started = context.pipeline.startStep({
      projectId: project.id,
      userId,
      step: "chapters",
    });
    if (!started) {
      res.status(409).json({
        error: "Chapters step cannot be started from the current project state.",
        project: context.projects.findByIdForUser(project.id, userId),
      });
      return;
    }

    try {
      const chapters = await context.gemini.generateChapters({
        bookPath: dataPath(project.bookPath),
        style: project.style,
        characters: project.characters.map((character) => ({
          name: character.name,
          prompt: character.prompt,
          portraitPath: character.portraitPath,
        })),
      });
      context.projects.replaceChapters({
        projectId: project.id,
        chapters: chapters.slice(0, 1),
      });
      context.pipeline.finishStep({ projectId: project.id, userId, step: "chapters" });

      res.json({ project: context.projects.findByIdForUser(project.id, userId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chapter generation failed.";
      context.pipeline.failStep({
        projectId: project.id,
        userId,
        step: "chapters",
        error: message,
      });
      res.status(502).json({
        error: message,
        project: context.projects.findByIdForUser(project.id, userId),
      });
    }
  });

  router.post("/:projectId/steps/illustrations", async (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
      res.status(401).json({ error: "Sign in before running a project step." });
      return;
    }

    const project = context.projects.findByIdForUser(req.params.projectId, userId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    if (!project.style || project.chapters.length === 0) {
      res.status(409).json({
        error: "Generate chapter prompts before creating illustrations.",
        project,
      });
      return;
    }

    const started = context.pipeline.startStep({
      projectId: project.id,
      userId,
      step: "illustrations",
    });
    if (!started) {
      res.status(409).json({
        error: "Illustrations step cannot be started from the current project state.",
        project: context.projects.findByIdForUser(project.id, userId),
      });
      return;
    }

    try {
      const chapter = project.chapters[0];
      const bytes = await context.gemini.generateIllustration({
        chapterTitle: chapter.title,
        prompt: chapter.prompt,
        style: project.style,
        characters: project.characters.map((character) => ({
          name: character.name,
          portraitPath: character.portraitPath,
        })),
      });
      const relativePath = imagePath(project.id, `${chapter.id}.png`);
      writeImage(relativePath, bytes);
      context.projects.setChapterIllustrationPath({
        chapterId: chapter.id,
        illustrationPath: relativePath,
      });
      context.pipeline.finishStep({ projectId: project.id, userId, step: "illustrations" });

      res.json({ project: context.projects.findByIdForUser(project.id, userId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Illustration generation failed.";
      context.pipeline.failStep({
        projectId: project.id,
        userId,
        step: "illustrations",
        error: message,
      });
      res.status(502).json({
        error: message,
        project: context.projects.findByIdForUser(project.id, userId),
      });
    }
  });

  router.post("/:projectId/steps/:step", (_req, res) => {
    res.status(404).json({ error: "Unknown or unimplemented pipeline step." });
  });

  router.post("/:projectId/steps/:step/retry", (req, res) => {
    const userId = requireUserId(req, context);
    if (!userId) {
      res.status(401).json({ error: "Sign in before retrying a project step." });
      return;
    }

    const step = req.params.step;
    if (!isPipelineStep(step)) {
      res.status(404).json({ error: "Unknown pipeline step." });
      return;
    }

    const project = context.projects.findByIdForUser(req.params.projectId, userId);
    if (!project) {
      res.status(404).json({ error: "Project not found." });
      return;
    }

    let cleared = false;
    if (project.stepState === "failed") {
      cleared = context.pipeline.clearFailedStep({
        projectId: project.id,
        userId,
        step,
      });
    } else if (project.stepState === "running") {
      cleared = context.pipeline.clearStaleRunningStep({
        projectId: project.id,
        userId,
        step,
        staleBefore: staleBeforeDate(),
      });
    }

    if (!cleared) {
      res.status(409).json({
        error: "Step is not failed or stale enough to retry.",
        project: context.projects.findByIdForUser(project.id, userId),
      });
      return;
    }

    res.json({ project: context.projects.findByIdForUser(project.id, userId) });
  });

  return router;
}
