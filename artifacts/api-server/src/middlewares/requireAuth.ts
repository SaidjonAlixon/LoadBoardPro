import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

export type AuthRole = "admin" | "dispatcher" | "accounting" | "driver";

export interface AuthRequest extends Request {
  userId?: string;
  clerkId?: string;
  userRole?: AuthRole;
  dbUser?: typeof usersTable.$inferSelect;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    let user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
    if (!user) {
      // Just-in-time provisioning for new users
      const email = (auth as any).sessionClaims?.email as string | undefined ?? "";
      const name = (auth as any).sessionClaims?.name as string | undefined ?? null;
      const [created] = await db.insert(usersTable).values({
        id: crypto.randomUUID(),
        clerkId,
        email,
        name,
        role: "dispatcher",
      }).returning();
      user = created;
    }

    req.clerkId = clerkId;
    req.userId = user.id;
    req.userRole = user.role as AuthRole;
    req.dbUser = user;
    next();
  } catch (err) {
    req.log.error({ err }, "Auth middleware error");
    res.status(500).json({ error: "Internal server error" });
  }
};

export const requireRole = (...roles: AuthRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
};
