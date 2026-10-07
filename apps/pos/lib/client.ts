"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { readDraft } from "@cafeos/shared/pos/draft";
import type { RegisterDraft } from "@cafeos/shared/pos/types";
const memory = new Map<string, string>();
const event = "jayds-register-draft";
const subscribeOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
export class CashierRequestError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
export async function cashierRequest<T>(
  path: string,
  body: unknown,
  key?: string,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session)
    throw new CashierRequestError(
      "Your staff session expired. Sign in again; your ticket is retained.",
      401,
    );
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + data.session.access_token,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({
    error: "Confirmation could not be read. Retry the same sale.",
  }));
  if (!response.ok)
    throw new CashierRequestError(
      typeof result.error === "string"
        ? result.error
        : "The operation could not be confirmed",
      response.status,
    );
  return result as T;
}
function read(key: string) {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function useRegisterDraft(actor: string) {
  const key = "jayds-register:v1:" + actor;
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("storage", callback);
    window.addEventListener(event, callback);
    return () => {
      window.removeEventListener("storage", callback);
      window.removeEventListener(event, callback);
    };
  }, []);
  const get = useCallback(() => read(key), [key]);
  const raw = useSyncExternalStore(subscribe, get, () => null);
  const draft = useMemo(() => readDraft(raw), [raw]);
  const update = useCallback(
    (change: RegisterDraft | ((previous: RegisterDraft) => RegisterDraft)) => {
      const next =
        typeof change === "function" ? change(readDraft(read(key))) : change;
      const value = JSON.stringify(next);
      try {
        localStorage.setItem(key, value);
        memory.delete(key);
      } catch {
        memory.set(key, value);
      }
      window.dispatchEvent(new Event(event));
    },
    [key],
  );
  return [draft, update] as const;
}
