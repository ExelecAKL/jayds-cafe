import { createHash } from "node:crypto";
export const endpointHash = (endpoint: string) =>
  createHash("sha256").update(endpoint).digest("hex");
export function validPushEndpoint(value: unknown): value is string {
  try {
    if (typeof value !== "string" || value.length > 4096) return false;
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export function validPushKeys(
  keys: unknown,
): keys is { p256dh: string; auth: string } {
  if (
    !keys ||
    typeof keys !== "object" ||
    !("p256dh" in keys) ||
    !("auth" in keys) ||
    typeof keys.p256dh !== "string" ||
    typeof keys.auth !== "string"
  )
    return false;
  return (
    /^[\w-]+$/.test(keys.p256dh) &&
    /^[\w-]+$/.test(keys.auth) &&
    Buffer.from(keys.p256dh, "base64url").length === 65 &&
    Buffer.from(keys.auth, "base64url").length === 16
  );
}
