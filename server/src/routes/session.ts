import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../appContext.js";
import { sessionCookie } from "../http/sessionCookie.js";

const sessionSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
});

export function createSessionRouter(context: AppContext) {
  const router = Router();

  router.get("/", (req, res) => {
    const userId = req.cookies?.[sessionCookie];
    const user = typeof userId === "string" ? context.users.findById(userId) : null;

    if (!user) {
      res.status(401).json({ error: "No active session." });
      return;
    }

    res.json({ user });
  });

  router.post("/", (req, res) => {
    const parsed = sessionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Enter a name and valid email." });
      return;
    }

    const user = context.users.createOrUpdateByEmail(parsed.data);

    res.cookie(sessionCookie, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
    res.status(200).json({ user });
  });

  router.delete("/", (_req, res) => {
    res.clearCookie(sessionCookie, { path: "/" });
    res.status(204).end();
  });

  return router;
}
