import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, scryptSync } from "node:crypto";

function getPasswordPepper(): string {
  return process.env.USER_PASSWORD_SECRET ?? process.env.JWT_SECRET ?? "dev-secret-change-in-production";
}

function getVaultKey(): Buffer {
  return scryptSync(getPasswordPepper(), "loadboard-password-vault", 32);
}

/** Store password for later admin retrieval (encrypted at rest). */
export function encryptStoredPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptStoredPassword(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const buf = Buffer.from(stored, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getVaultKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export async function resolveRevealablePassword(
  user: {
    nickname?: string | null;
    email?: string | null;
    passwordHash: string;
    passwordEncrypted?: string | null;
    usesCustomPassword: boolean;
  },
  verifyHash: (plain: string, hash: string) => Promise<boolean>,
): Promise<string | null> {
  const fromVault = decryptStoredPassword(user.passwordEncrypted);
  if (fromVault) return fromVault;

  const login = resolveLoginHandle(user);
  if (!login) return null;

  const derived = derivePasswordFromNickname(login);
  if (await verifyHash(derived, user.passwordHash)) return derived;

  return null;
}

export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

/** @deprecated use normalizeEmailAddress for emails */
export function normalizeEmail(email: string): string {
  return email.includes("@") ? normalizeEmailAddress(email) : normalizeNickname(email);
}

export function parseLoginInput(raw: string): { nickname?: string; email?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.includes("@")) {
    const email = normalizeEmailAddress(trimmed);
    const local = email.split("@")[0] ?? "";
    const nickname = local ? normalizeNickname(local) : undefined;
    return { email, nickname };
  }
  return { nickname: normalizeNickname(trimmed) };
}

export function isValidNickname(nickname: string): boolean {
  const normalized = normalizeNickname(nickname);
  return /^[a-z0-9_]{3,32}$/.test(normalized);
}

/** Deterministic default password from login nickname (stored as bcrypt hash in DB). */
export function derivePasswordFromNickname(nickname: string): string {
  const normalized = normalizeNickname(nickname);
  const local = normalized.replace(/[^a-z0-9]/gi, "") || "user";
  const digest = createHmac("sha256", getPasswordPepper())
    .update(normalized)
    .digest("base64url")
    .replace(/[^a-zA-Z0-9]/g, "");
  const prefix = local.charAt(0).toUpperCase() + local.slice(1, 14);
  const token = digest.slice(0, 10);
  return `${prefix}@${token}!`;
}

/** @deprecated use derivePasswordFromNickname */
export function derivePasswordFromEmail(email: string): string {
  const normalized = email.includes("@")
    ? normalizeEmailAddress(email)
    : normalizeNickname(email);
  if (normalized.includes("@")) {
    const local = normalized.split("@")[0]?.replace(/[^a-z0-9]/gi, "") || "user";
    const digest = createHmac("sha256", getPasswordPepper())
      .update(normalized)
      .digest("base64url")
      .replace(/[^a-zA-Z0-9]/g, "");
    const prefix = local.charAt(0).toUpperCase() + local.slice(1, 14);
    const token = digest.slice(0, 10);
    return `${prefix}@${token}!`;
  }
  return derivePasswordFromNickname(normalized);
}

export function validateCustomPassword(password: string): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}

/** One-time random password — old hash is replaced; previous passwords stop working. */
export function generateRandomPassword(loginHandle?: string): string {
  const local = (loginHandle ?? "User").replace(/[^a-z0-9]/gi, "") || "User";
  const prefix = local.charAt(0).toUpperCase() + local.slice(1, 14);
  const nonce = randomUUID().replace(/-/g, "").slice(0, 8);
  const token = randomBytes(12)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8);
  return `${prefix}@${nonce}${token}!`;
}

/** Resolve display/login handle from nickname or legacy email. */
export function resolveLoginHandle(user: { nickname?: string | null; email?: string | null }): string {
  const raw = (user.nickname ?? user.email ?? "").trim().replace(/^@+/, "");
  if (!raw) return "";
  if (user.nickname) return normalizeNickname(user.nickname);
  if (raw.includes("@")) return normalizeNickname(raw.split("@")[0] ?? raw);
  return normalizeNickname(raw);
}
