import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiAccessError } from "./server-access";
import { safeMayaCheckoutUrl } from "@cafeos/shared/maya-urls";
import { safeLalamoveUrl } from "@cafeos/shared/lalamove-urls";

export interface ProviderAttempt {
  id: string;
  order_id: string;
  provider: "maya" | "lalamove" | "lalamove_cancel";
  state: "creating" | "ready" | "uncertain" | "failed" | "paid" | "cancelled";
  request_key: string;
  remote_id: string | null;
  remote_url: string | null;
  amount: number;
  request_payload: Record<string, unknown>;
}
export async function claimProviderAttempt(
  db: SupabaseClient,
  orderId: string,
  provider: ProviderAttempt["provider"],
  actor: string | null,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await db.rpc("customer_claim_provider_attempt", {
    p_order: orderId,
    p_provider: provider,
    p_actor: actor,
    p_payload: payload,
  });
  if (error)
    throw new ApiAccessError(
      error.code === "PGRST202"
        ? "Provider setup is unavailable."
        : "The order cannot start this provider operation. Refresh the order or contact the cafe.",
      error.code === "PGRST202" ? 503 : 409,
    );
  if (!data?.attempt?.id)
    throw new ApiAccessError("Provider setup is unavailable.", 503);
  return data as { claimed: boolean; attempt: ProviderAttempt };
}
export async function finishProviderAttempt(
  db: SupabaseClient,
  attempt: ProviderAttempt,
  state: "ready" | "uncertain" | "failed" | "cancelled",
  remoteId: string | null = null,
  url: string | null = null,
  failure: string | null = null,
) {
  const { data, error } = await db.rpc("customer_finish_provider_attempt", {
    p_attempt: attempt.id,
    p_state: state,
    p_remote: remoteId,
    p_url: url,
    p_failure: failure,
  });
  if (error || !data)
    throw new ApiAccessError(
      "The provider response needs reconciliation. Contact the cafe; do not create another booking or payment.",
      503,
    );
  return data as ProviderAttempt;
}
export async function markUncertain(
  db: SupabaseClient,
  attempt: ProviderAttempt,
  code: string,
) {
  // If this write also fails, the durable creating claim still prevents automatic retry.
  try {
    await finishProviderAttempt(
      db,
      attempt,
      "uncertain",
      attempt.remote_id,
      attempt.remote_url,
      code,
    );
  } catch {
    console.error("Provider reconciliation required", {
      attemptId: attempt.id,
      provider: attempt.provider,
    });
  }
}
export function pendingAttemptError(attempt: ProviderAttempt): never {
  throw new ApiAccessError(
    attempt.state === "creating"
      ? "This provider request is already being processed. Refresh the order shortly."
      : "The previous provider response needs reconciliation. Please contact the cafe before retrying.",
    409,
  );
}
export function safeProviderUrl(url: unknown): string | null {
  return safeMayaCheckoutUrl(url) || safeLalamoveUrl(url);
}
