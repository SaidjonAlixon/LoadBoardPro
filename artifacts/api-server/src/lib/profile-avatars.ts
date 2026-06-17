export const ROLE_AVATAR_KEYS: Record<string, readonly string[]> = {
  dispatcher: ["dispatch1", "dispatch2", "dispatch3"],
  accounting: ["bugalter1", "bugalter2", "bugalter3"],
  admin: ["boss", "ceo", "admin"],
};

export function isAvatarKeyValidForRole(role: string, avatarKey: string | null | undefined): boolean {
  if (!avatarKey) return true;
  return (ROLE_AVATAR_KEYS[role] ?? []).includes(avatarKey);
}
