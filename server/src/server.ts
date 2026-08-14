import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import type { AppContext } from "./appContext.js";
import { createAppContext } from "./appContext.js";
import { createProjectRouter } from "./routes/projects.js";
import { createSessionRouter } from "./routes/session.js";

export function createServer(context: AppContext = createAppContext()) {
  const app = express();

  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/session", createSessionRouter(context));
  app.use("/api/projects", createProjectRouter(context));

  return app;
}
