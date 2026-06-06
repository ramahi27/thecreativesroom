export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "folder";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extract the UUID from a route param that may be "uuid" or "uuid-title-slug". */
export function extractId(param: string): string {
  return UUID_RE.exec(param)?.[0] ?? param;
}

/** Build the canonical /ref path for a reference. */
export function refPath(id: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug ? `/ref/${id}-${slug}` : `/ref/${id}`;
}
