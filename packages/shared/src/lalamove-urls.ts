export function safeLalamoveUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      ["share.lalamove.com", "share.sandbox.lalamove.com"].includes(
        url.hostname,
      )
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
