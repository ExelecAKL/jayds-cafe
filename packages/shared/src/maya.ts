// packages/shared/src/maya.ts
// Maya Business API Service — sandbox/production toggle via MAYA_ENV

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MayaCheckoutRequest, MayaCheckoutResponse } from "./types/index";

const MAYA_BASE_URL =
  process.env.MAYA_ENV === "production"
    ? "https://pg.maya.ph"
    : "https://pg-sandbox.paymaya.com";
const MAYA_SECRET_KEY = process.env.MAYA_SECRET_KEY ?? "";
const MAYA_PUBLIC_KEY = process.env.NEXT_PUBLIC_MAYA_PUBLIC_KEY ?? "";
const MAYA_REQUEST_TIMEOUT_MS = 20_000;
// Maya's Basic Buyer fields are optional. Kount merchants must collect their
// required real buyer data rather than substituting names, contacts or addresses.
export type MayaCheckoutInput = Omit<MayaCheckoutRequest, "buyer"> & {
  buyer?: {
    firstName?: string;
    lastName?: string;
    contact?: { phone?: string; email?: string };
    shippingAddress?: Partial<MayaCheckoutRequest["buyer"]["shippingAddress"]>;
    billingAddress?: Partial<MayaCheckoutRequest["buyer"]["billingAddress"]>;
  };
};

export class MayaProviderError extends Error {
  constructor(
    message: string,
    readonly uncertain: boolean,
    readonly status = 502,
  ) {
    super(message);
  }
}

function assertMayaSecretKey() {
  if (!MAYA_SECRET_KEY) {
    throw new Error("Missing MAYA_SECRET_KEY environment variable.");
  }
}

function assertMayaPublicKey() {
  if (!MAYA_PUBLIC_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_MAYA_PUBLIC_KEY environment variable.",
    );
  }
}

function getAuthHeader(apiKey: string): string {
  const authHeader = "Basic " + Buffer.from(apiKey + ":").toString("base64");
  return authHeader;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    MAYA_REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new MayaProviderError(
        "Maya response timed out; payment reconciliation is required.",
        true,
        504,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function toFiniteNumber(value: unknown, fieldName: string): number {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return amount;
}

function normalizePhone(phone: string): string | undefined {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return undefined;
  }

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }

  if (digits.startsWith("63")) {
    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    return `+63${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `+63${digits}`;
  }

  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : undefined;
}

function normalizeBuyer(
  input: MayaCheckoutInput["buyer"],
): MayaCheckoutInput["buyer"] {
  if (!input) return undefined;
  const buyer: NonNullable<MayaCheckoutInput["buyer"]> = {};
  if (input.firstName?.trim()) buyer.firstName = input.firstName.trim();
  if (input.lastName?.trim()) buyer.lastName = input.lastName.trim();
  const phone = normalizePhone(input.contact?.phone ?? ""),
    email = input.contact?.email?.trim();
  const contact: { phone?: string; email?: string } = {};
  if (phone && /^\+[1-9]\d{7,14}$/.test(phone)) contact.phone = phone;
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) contact.email = email;
  if (Object.keys(contact).length) buyer.contact = contact;
  for (const type of ["shippingAddress", "billingAddress"] as const) {
    const address = input[type];
    if (!address) continue;
    const cleaned = Object.fromEntries(
      ["line1", "city", "state", "zipCode", "countryCode"]
        .map((key) => [key, address[key as keyof typeof address]?.trim()])
        .filter(([, value]) => !!value),
    );
    if (Object.keys(cleaned).length) buyer[type] = cleaned;
  }
  return Object.keys(buyer).length ? buyer : undefined;
}

function normalizeMayaPaymentState(payload: {
  isPaid?: boolean;
  status?: string;
  paymentStatus?: string;
}): "pending" | "paid" | "failed" {
  const mayaStatus = String(
    payload.paymentStatus ?? payload.status ?? "",
  ).toUpperCase();

  if (
    payload.isPaid ||
    mayaStatus === "PAYMENT_SUCCESS" ||
    mayaStatus === "COMPLETED"
  ) {
    return "paid";
  }

  if (
    mayaStatus === "PAYMENT_FAILED" ||
    mayaStatus === "PAYMENT_EXPIRED" ||
    mayaStatus === "PAYMENT_CANCELLED" ||
    mayaStatus === "CHECKOUT_CANCELLED" ||
    mayaStatus === "CANCELLED" ||
    mayaStatus === "FAILED" ||
    mayaStatus === "EXPIRED" ||
    mayaStatus === "VOIDED"
  ) {
    return "failed";
  }

  return "pending";
}

export const MayaService = {
  /**
   * Create a Maya checkout session.
   * Returns the checkout ID and redirect URL for the customer.
   * SERVER-ONLY — uses the merchant's public checkout key.
   */
  async createCheckout(
    request: MayaCheckoutInput,
  ): Promise<MayaCheckoutResponse> {
    assertMayaPublicKey();

    const payload: MayaCheckoutInput = {
      totalAmount: {
        value: toFiniteNumber(request.totalAmount.value, "totalAmount.value"),
        currency: request.totalAmount.currency || "PHP",
        details: request.totalAmount.details
          ? {
              subtotal: toFiniteNumber(
                request.totalAmount.details.subtotal,
                "totalAmount.details.subtotal",
              ),
              discount: toFiniteNumber(
                request.totalAmount.details.discount,
                "totalAmount.details.discount",
              ),
              serviceCharge: toFiniteNumber(
                request.totalAmount.details.serviceCharge,
                "totalAmount.details.serviceCharge",
              ),
              shippingFee: toFiniteNumber(
                request.totalAmount.details.shippingFee,
                "totalAmount.details.shippingFee",
              ),
              tax: toFiniteNumber(
                request.totalAmount.details.tax,
                "totalAmount.details.tax",
              ),
            }
          : undefined,
      },
      buyer: normalizeBuyer(request.buyer),
      items: request.items.map((item, index) => ({
        name: String(item.name),
        quantity: toFiniteNumber(item.quantity, `items[${index}].quantity`),
        code: String(item.code ?? "ITEM"),
        description: String(item.description ?? item.name),
        amount: {
          value: toFiniteNumber(
            item.amount.value,
            `items[${index}].amount.value`,
          ),
          currency: item.amount.currency || "PHP",
        },
        totalAmount: {
          value: toFiniteNumber(
            item.totalAmount.value,
            `items[${index}].totalAmount.value`,
          ),
          currency: item.totalAmount.currency || "PHP",
        },
      })),
      redirectUrl: request.redirectUrl,
      requestReferenceNumber: String(request.requestReferenceNumber),
      metadata: request.metadata
        ? Object.fromEntries(
            Object.entries(request.metadata).map(([key, value]) => [
              key,
              String(value),
            ]),
          )
        : undefined,
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${MAYA_BASE_URL}/checkout/v1/checkouts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: getAuthHeader(MAYA_PUBLIC_KEY),
          },
          body: JSON.stringify(payload),
        },
      );
    } catch (error) {
      if (error instanceof MayaProviderError) throw error;
      throw new MayaProviderError(
        "Maya response is unavailable; payment reconciliation is required.",
        true,
      );
    }

    if (!response.ok) {
      // Never echo provider bodies: they may contain customer details or merchant diagnostics.
      const uncertain =
        response.status >= 500 || [408, 409, 429].includes(response.status);
      throw new MayaProviderError(
        uncertain
          ? "Maya response needs reconciliation."
          : "Maya declined checkout creation.",
        uncertain,
        response.status,
      );
    }

    let data: { checkoutId?: unknown; redirectUrl?: unknown };
    try {
      data = await response.json();
    } catch {
      throw new MayaProviderError(
        "Maya returned an incomplete response; payment reconciliation is required.",
        true,
      );
    }
    if (
      typeof data.checkoutId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data.checkoutId,
      ) ||
      typeof data.redirectUrl !== "string" ||
      !data.redirectUrl.startsWith("https://")
    ) {
      throw new MayaProviderError(
        "Maya returned an incomplete response; payment reconciliation is required.",
        true,
      );
    }

    return {
      checkoutId: data.checkoutId,
      redirectUrl: data.redirectUrl,
    };
  },

  /**
   * Get the status of a Maya checkout by its checkout ID.
   * SERVER-ONLY — uses MAYA_SECRET_KEY.
   */
  async getCheckoutStatus(checkoutId: string): Promise<{
    id: string;
    isPaid?: boolean;
    status?: string;
    paymentStatus?: string;
    amount?: string | number;
    currency?: string;
    totalAmount?: { value: string | number; currency: string };
    requestReferenceNumber?: string;
    receipt?: { transactionId?: string };
  }> {
    assertMayaSecretKey();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        checkoutId,
      )
    ) {
      throw new Error("Invalid Maya checkout ID.");
    }

    const response = await fetchWithTimeout(
      `${MAYA_BASE_URL}/payments/v1/payments/${checkoutId}`,
      {
        method: "GET",
        headers: {
          Authorization: getAuthHeader(MAYA_SECRET_KEY),
        },
      },
    );

    if (!response.ok) {
      throw new MayaProviderError(
        "Maya payment verification is temporarily unavailable.",
        false,
        response.status,
      );
    }

    return response.json();
  },

  /**
   * Verify Maya payment status and update Supabase order accordingly.
   * SERVER-ONLY — used in webhook handler and polling endpoints.
   */
  async verifyAndUpdateOrder(
    checkoutId: string,
    supabaseAdmin: SupabaseClient,
  ): Promise<{ success: boolean; orderId?: string; status?: string }> {
    try {
      // The callback only triggers verification. Trust the authenticated Maya
      // response, never a status, amount, or order ID supplied in a webhook.
      const checkoutStatus = await this.getCheckoutStatus(checkoutId);
      const amount = Number(
        checkoutStatus.amount ?? checkoutStatus.totalAmount?.value,
      );
      const currency =
        checkoutStatus.currency ?? checkoutStatus.totalAmount?.currency;
      if (
        checkoutStatus.id !== checkoutId ||
        currency !== "PHP" ||
        !Number.isFinite(amount) ||
        amount < 0
      ) {
        console.error("Maya payment identity or amount mismatch");
        return { success: false };
      }

      // Maya retrieve-payment responses may expose the final state in either
      // `status` or `paymentStatus`, so normalize both.
      const paymentStatus = normalizeMayaPaymentState(checkoutStatus);
      // One database lock owns amount matching, payment-attempt association,
      // settlement monotonicity, and late scheduled-payment cancellation.
      const { data, error } = await supabaseAdmin.rpc(
        "customer_finalize_maya_payment",
        {
          p_checkout: checkoutId,
          p_payment: checkoutStatus.receipt?.transactionId || checkoutStatus.id,
          p_amount: amount,
          p_currency: currency,
          p_state: paymentStatus,
        },
      );
      if (error || !data?.success) {
        console.error("Maya settlement could not be recorded", {
          code: error?.code ?? "NO_RESULT",
        });
        return { success: false };
      }

      return { success: true, orderId: data.orderId, status: data.status };
    } catch (err) {
      console.error("Maya verification unavailable", {
        name: err instanceof Error ? err.name : "UnknownError",
      });
      return { success: false };
    }
  },
};
