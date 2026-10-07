/** Native fetch and auth callbacks need the same prefix as Next's links. */
export function appPath(
  path: string,
  base = process.env.NEXT_PUBLIC_APP_BASE_PATH || "",
): string {
  if (!base || !path.startsWith("/") || path.startsWith("//")) return path;
  if (
    path === base ||
    ["/", "?", "#"].some((separator) => path.startsWith(base + separator))
  )
    return path;
  return base + path;
}
