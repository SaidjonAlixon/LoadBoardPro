import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from "../lib/auth";
import { parseLoginInput, resolveLoginHandle } from "../lib/user-credentials";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

function serializeUser(u: typeof usersTable.$inferSelect) {
  const login = resolveLoginHandle(u);
  return {
    id: u.id,
    nickname: login || null,
    email: u.email,
    name: u.name,
    avatarKey: u.avatarKey,
    role: u.role,
    isActive: u.isActive,
    usesCustomPassword: u.usesCustomPassword,
    createdAt: u.createdAt,
  };
}

router.post("/register", async (_req, res) => {
  res.status(403).json({
    error: "Public registration is disabled. Contact your administrator for access.",
  });
});

router.post("/login", async (req, res) => {
  const { nickname, email, login, password } = req.body as {
    nickname?: string;
    email?: string;
    login?: string;
    password?: string;
  };

  const rawLogin = nickname ?? login ?? email;
  if (!rawLogin?.trim() || !password) {
    res.status(400).json({ error: "Login and password are required" });
    return;
  }

  const parsed = parseLoginInput(rawLogin);
  const lookupClauses = [];
  if (parsed.nickname) lookupClauses.push(eq(usersTable.nickname, parsed.nickname));
  if (parsed.email) lookupClauses.push(eq(usersTable.email, parsed.email));

  if (lookupClauses.length === 0) {
    res.status(400).json({ error: "Enter a nickname or Gmail address" });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: lookupClauses.length === 1 ? lookupClauses[0] : or(...lookupClauses),
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid login or password" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid login or password" });
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
