import { NextRequest, NextResponse } from "next/server";
import {
  JsonBodyError,
  readJsonBody,
  WEBHOOK_BODY_LIMIT,
} from "@cafeos/shared/server/request-body";
import { createAdminSupabaseClient } from "@cafeos/shared/supabase/server";
import { MayaService } from "@cafeos/shared/maya";

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await readJsonBody(req, { maxBytes: WEBHOOK_BODY_LIMIT });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof JsonBodyError && error.status !== 400
            ? error.message
            : "Invalid webhook payload",
      },
      { status: error instanceof JsonBodyError ? error.status : 400 },
    );
  }
  const checkoutId =
    payload && typeof payload === "object" && "id" in payload
      ? payload.id
      : null;
  if (
    typeof checkoutId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      checkoutId,
    )
  ) {
    return NextResponse.json({ error: "Invalid checkout ID" }, { status: 400 });
  }

  try {
    // Maya Checkout does not document an HMAC signature. Treat the event as
    // an untrusted hint and retrieve the payment with our merchant secret key.
    // Also configure Maya's documented IP allowlist at the deployment edge.
    const result = await MayaService.verifyAndUpdateOrder(
      checkoutId,
      createAdminSupabaseClient(),
    );
    if (!result.success) {
      // A non-2xx response lets Maya retry a transient verification failure.
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Maya webhook verification unavailable", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 503 },
    );
  }
}
