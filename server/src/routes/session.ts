import { Router } from "express";

export const sessionRouter = Router();

sessionRouter.post("/", (_req, res) => {
  res.status(501).json({ error: "Session endpoint scaffolded but not implemented yet." });
});

sessionRouter.delete("/", (_req, res) => {
  res.status(204).end();
});
