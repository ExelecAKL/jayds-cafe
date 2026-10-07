// Preserve a submission identity across retries of the same payload in this browser tab.
import { createUuid } from "../utils/uuid";
const fallbackKeys = new Map<string, { payload: string; key: string }>();
const fallbackPayloads = new Map<
  string,
  { comparable: string; payload: Record<string, unknown> }
>();
export function submissionKey(scope: string, payload: unknown) {
  const serialized = JSON.stringify(payload);
  const name = `jayds-submission:${scope}`;
  try {
    const previous = JSON.parse(sessionStorage.getItem(name) ?? "null") as {
      payload: string;
      key: string;
    } | null;
    if (previous?.payload === serialized) return previous.key;
  } catch {
    /* Storage can be disabled; keep this tab's retry identity. */
  }
  const remembered = fallbackKeys.get(name);
  if (remembered?.payload === serialized) return remembered.key;
  const key = createUuid();
  fallbackKeys.set(name, { payload: serialized, key });
  try {
    sessionStorage.setItem(name, JSON.stringify({ payload: serialized, key }));
  } catch {
    /* The in-memory identity remains stable. */
  }
  return key;
}
export function clearSubmission(scope: string) {
  fallbackKeys.delete(`jayds-submission:${scope}`);
  fallbackPayloads.delete(`jayds-payload:${scope}`);
  try {
    sessionStorage.removeItem(`jayds-submission:${scope}`);
    sessionStorage.removeItem(`jayds-payload:${scope}`);
  } catch {
    /* Session storage can be disabled. */
  }
}

export function retryPayload<T extends Record<string, unknown>>(
  scope: string,
  payload: T,
): T {
  const comparable = JSON.stringify({
    ...payload,
    expires_at: undefined,
    pickup_confirmation_hash: undefined,
  });
  const name = "jayds-payload:" + scope;
  try {
    const saved = JSON.parse(sessionStorage.getItem(name) ?? "null") as {
      comparable: string;
      payload: T;
    } | null;
    if (saved?.comparable === comparable) return saved.payload;
  } catch {
    /* Storage may be disabled. */
  }
  const remembered = fallbackPayloads.get(name);
  if (remembered?.comparable === comparable) return remembered.payload as T;
  fallbackPayloads.set(name, { comparable, payload });
  try {
    sessionStorage.setItem(name, JSON.stringify({ comparable, payload }));
  } catch {
    /* Keep the tab's immutable retry payload. */
  }
  return payload;
}
