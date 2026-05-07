export const USERNAME_REGEX = /^[a-z0-9_-]{3,24}$/;

export const RESERVED_USERNAMES = new Set([
  "admin",
  "account",
  "auth",
  "add",
  "drafts",
  "bookmarks",
  "mycollection",
  "collection",
  "settings",
  "logs",
  "users",
  "ref",
  "edit",
  "privacy",
  "terms",
  "welcome",
  "api",
  "u",
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
  "profile",
]);

export function validateUsername(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: false, error: "Pick a username." };
  if (!USERNAME_REGEX.test(value))
    return { ok: false, error: "3–24 chars, lowercase letters, numbers, _ or -" };
  if (RESERVED_USERNAMES.has(value)) return { ok: false, error: "That username is reserved." };
  return { ok: true, value };
}

function origin(): string {
  if (typeof window === "undefined") return "";
  if (window.location.hostname.includes("thecreativesroom.com"))
    return "https://thecreativesroom.com";
  return window.location.origin;
}

export function profileUrl(username: string): string {
  return `${origin()}/u/${username}`;
}

export function folderShareUrl(username: string, folderSlug: string): string {
  return `${profileUrl(username)}/${folderSlug}`;
}
