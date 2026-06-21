import { Router } from "express";
import { db, loadsTable, notificationsTable, usersTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/auth";
import {
  derivePasswordFromNickname,
  encryptStoredPassword,
  generateRandomPassword,
  isValidNickname,
  normalizeNickname,
  resolveLoginHandle,
  resolveRevealablePassword,
  validateCustomPassword,
} from "../lib/user-credentials";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";
import { isAvatarKeyValidForRole } from "../lib/profile-avatars";

const router = Router();

// GET /api/users/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  res.json(serializeUser(req.dbUser!));
});

// PATCH /api/users/me
router.patch("/me", requireAuth, async (req: AuthRequest, res) => {
  const { name, avatarKey } = req.body as { name?: string; avatarKey?: string | null };
  const updates: Record<string, unknown> = {};

  if (name !== undefined) updates.name = name;
  if (avatarKey !== undefined) {
    if (!isAvatarKeyValidForRole(req.userRole!, avatarKey)) {
      res.status(400).json({ error: "Invalid avatar for this role" });
      return;
    }
    updates.avatarKey = avatarKey;
  }

  if (!Object.keys(updates).length) {
    res.json(serializeUser(req.dbUser!));
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json(serializeUser(updated));
});

// GET /api/users/dispatchers (all authenticated — for loads board filter)
router.get("/dispatchers", requireAuth, async (_req, res) => {
  const users = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.role, "dispatcher"), eq(usersTable.isActive, true)));
  res.json(users.map(serializeUser));
});

// GET /api/users (admin only)
router.get("/", requireAuth, requireRole("admin"), async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map(serializeUser));
});

// POST /api/users (admin only)
router.post("/", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
  const { nickname, firstName, lastName, name, role, password } = req.body as {
    nickname?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    role?: string;
    password?: string;
  };

  const normalizedNickname = nickname ? normalizeNickname(nickname) : "";
  if (!normalizedNickname || !isValidNickname(normalizedNickname)) {
    res.status(400).json({ error: "A valid nickname is required (3–32 letters, numbers, or _)" });
    return;
  }

  const allowedRoles = ["admin", "dispatcher", "accounting", "driver"] as const;
  if (!role || !allowedRoles.includes(role as (typeof allowedRoles)[number])) {
    res.status(400).json({ error: "Valid role is required" });
    return;
  }

  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ")
    || name?.trim()
    || null;
  if (!fullName) {
    res.status(400).json({ error: "First and last name are required" });
    return;
  }

  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.nickname, normalizedNickname),
  });
  if (existing) {
    res.status(409).json({ error: "Nickname already registered" });
    return;
  }

  let plainPassword: string;
  let usesCustomPassword = false;
  if (password?.trim()) {
    const passwordError = validateCustomPassword(password.trim());
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    plainPassword = password.trim();
    usesCustomPassword = true;
  } else {
    plainPassword = derivePasswordFromNickname(normalizedNickname);
  }

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        nickname: normalizedNickname,
        email: null,
        passwordHash: await hashPassword(plainPassword),
        passwordEncrypted: encryptStoredPassword(plainPassword),
        usesCustomPassword,
        name: fullName,
        role,
      })
      .returning();

    res.status(201).json({
      user: serializeUser(user),
      generatedPassword: plainPassword,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Nickname already registered" });
      return;
    }
    req.log?.error?.({ err }, "Create user failed");
    res.status(500).json({ error: "Failed to create user" });
  }
});

// GET /api/users/:id/credentials (admin only — reveal login + default password)
router.get("/:id/credentials", requireAuth, requireRole("admin"), async (req, res) => {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.params.id),
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const login = resolveLoginHandle(user);
  const password = await resolveRevealablePassword(user, verifyPassword);

  res.json({
    nickname: login,
    password,
    usesCustomPassword: user.usesCustomPassword,
    canReveal: password != null,
  });
});

// POST /api/users/:id/reset-password (admin only)
router.post("/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  const { password } = req.body as { password?: string };
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.params.id),
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const login = resolveLoginHandle(user);
  if (!login) {
    res.status(400).json({ error: "User has no login nickname" });
    return;
  }

  let plainPassword: string;
  let usesCustomPassword: boolean;
  if (password?.trim()) {
    const passwordError = validateCustomPassword(password.trim());
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    plainPassword = password.trim();
    usesCustomPassword = true;
  } else {
    plainPassword = generateRandomPassword(login);
    usesCustomPassword = true;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      passwordHash: await hashPassword(plainPassword),
      passwordEncrypted: encryptStoredPassword(plainPassword),
      usesCustomPassword,
    })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json({
    user: serializeUser(updated),
    generatedPassword: plainPassword,
    nickname: login,
  });
});

// PATCH /api/users/:id (admin only)
router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, role, isActive, password } = req.body as {
    name?: string;
    role?: string;
    isActive?: boolean;
    password?: string;
  };
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (isActive !== undefined) updates.isActive = isActive;

  if (password !== undefined) {
    if (!password.trim()) {
      res.status(400).json({ error: "Password cannot be empty" });
      return;
    }
    const passwordError = validateCustomPassword(password.trim());
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    updates.passwordHash = await hashPassword(password.trim());
    updates.passwordEncrypted = encryptStoredPassword(password.trim());
    updates.usesCustomPassword = true;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.params.id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeUser(updated));
});

// DELETE /api/users/:id (admin only — permanent)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
  const { id } = req.params;

  if (id === req.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, id),
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (user.role === "admin") {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    if (admins.length <= 1) {
      res.status(400).json({ error: "Cannot delete the last administrator" });
      return;
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(notificationsTable).where(eq(notificationsTable.userId, id));
      await tx.update(loadsTable).set({ dispatcherId: null }).where(eq(loadsTable.dispatcherId, id));
      await tx.delete(usersTable).where(eq(usersTable.id, id));
    });
    res.status(204).send();
  } catch (err: unknown) {
    req.log?.error?.({ err }, "Delete user failed");
    res.status(500).json({ error: "Failed to delete user" });
  }
});

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

export default router;
