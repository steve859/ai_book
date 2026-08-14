import { Router } from "express";

export const projectRouter = Router();

projectRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "Project list endpoint scaffolded but not implemented yet." });
});

projectRouter.post("/", (_req, res) => {
  res.status(501).json({ error: "Project creation endpoint scaffolded but not implemented yet." });
});

projectRouter.get("/:projectId", (_req, res) => {
  res.status(501).json({ error: "Project detail endpoint scaffolded but not implemented yet." });
});

projectRouter.post("/:projectId/steps/:step", (_req, res) => {
  res.status(501).json({ error: "Pipeline step endpoint scaffolded but not implemented yet." });
});

projectRouter.post("/:projectId/steps/:step/retry", (_req, res) => {
  res.status(501).json({ error: "Step retry endpoint scaffolded but not implemented yet." });
});
