import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from "../lib/auth";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

function serializeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarKey: u.avatarKey,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

router.post("/register", async (_req, res) => {
  res.status(403).json({
    error: "Public registration is disabled. Contact your administrator for access.",
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email.trim().toLowerCase()),
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = await createSessionToken(user.id);
  setSessionCookie(res, token);
  res.json(serializeUser(user));
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/session", requireAuth, (req: AuthRequest, res) => {
  res.json(serializeUser(req.dbUser!));
});

export default router;
