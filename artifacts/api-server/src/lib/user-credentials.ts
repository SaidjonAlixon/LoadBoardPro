import { createHmac } from "node:crypto";

function getPasswordPepper(): string {
  return process.env.USER_PASSWORD_SECRET ?? process.env.JWT_SECRET ?? "dev-secret-change-in-production";
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deterministic initial password from email (stored as bcrypt hash in DB). */
export function derivePasswordFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const local = normalized.split("@")[0]?.replace(/[^a-z0-9]/gi, "") || "user";
  const digest = createHmac("sha256", getPasswordPepper())
    .update(normalized)
    .digest("base64url")
    .replace(/[^a-zA-Z0-9]/g, "");
  const prefix = local.charAt(0).toUpperCase() + local.slice(1, 14);
  const token = digest.slice(0, 10);
  return `${prefix}@${token}!`;
}

export function isGmailAddress(email: string): boolean {
  return /^[^\s@]+@gmail\.com$/i.test(normalizeEmail(email));
}
