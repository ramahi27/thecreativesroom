export const USERNAME_REGEX = /^[a-z0-9_-]{3,24}$/;

export const RESERVED_USERNAMES = new Set([
  "admin",
  "account",
  "auth",
  "add",
  "drafts",
  "bookmarks",
  "mycollection",
  "settings",
  "logs",
  "users",
  "ref",
  "edit",
  "privacy",
  "terms",
  "welcome",
  "api",
  "reset-password",
  "the-creatives-room",
  "thecreativesroom",
  "support",
  "about",
  "help",
  "login",
  "signup",
  "signin",
  "logout",
]);

export function validateUsername(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: false, error: "Pick a username." };
  if (!USERNAME_REGEX.test(value))
    return { ok: false, error: "3–24 chars, lowercase letters, numbers, _ or -" };
  if (RESERVED_USERNAMES.has(value)) return { ok: false, error: "That username is reserved." };
  return { ok: true, value };
}

export function profileUrl(username: string): string {
  const origin =
    typeof window !== "undefined" && window.location.hostname.includes("thecreativesroom.com")
      ? "https://thecreativesroom.com"
      : typeof window !== "undefined"
        ? window.location.origin
        : "";
  return `${origin}/@${username}`;
}

export function folderShareUrl(username: string, folderId: string): string {
  return `${profileUrl(username)}/c/${folderId}`;
}
