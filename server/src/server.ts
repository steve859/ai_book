import cors from "cors";
import express from "express";
import { projectRouter } from "./routes/projects.js";
import { sessionRouter } from "./routes/session.js";

export function createServer() {
  const app = express();

  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/session", sessionRouter);
  app.use("/api/projects", projectRouter);

  return app;
}
