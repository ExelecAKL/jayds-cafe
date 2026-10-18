import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import { lalamoveRequest, PICKUP } from "../lib";
import { LALAMOVE_SERVICE_TYPE } from "../policy";
import { readCustomerBranch } from "../../branch/lib";
import { withinCoverage } from "../../../../lib/location";
import {
  ApiAccessError,
  PRIVATE_HEADERS,
  apiAccessErrorResponse,
  requireOrderAccess,
} from "../../../../lib/server-access";
import {
  claimProviderAttempt,
  finishProviderAttempt,
  markUncertain,
  pendingAttemptError,
  safeProviderUrl,
} from "../../../../lib/provider-attempts";

interface QuoteResponse {
  data: {
    quotationId: string;
    serviceType: string;
    stops: { stopId: string }[];
    priceBreakdown: { total: string; currency: string };
  };
}
interface DeliveryResponse {
  data: {
    orderId: string;
    shareLink?: string;
    status: string;
    metadata?: Record<string, string>;
    priceBreakdown?: { total: string; currency: string };
  };
}
const cors = (req: NextRequest): Record<string, string> => {
  const origin = req.headers.get("origin");
  const allowed = [
    process.env.NEXT_PUBLIC_CUSTOMER_URL,
    process.env.NEXT_PUBLIC_POS_URL,
  ].filter(Boolean);
  return origin && allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "OPTIONS, POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        Vary: "Origin",
      }
    : {};
};
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const { db, order, actorId } = await requireOrderAccess(req, body.orderId, {
      scope: "manage",
      staffOnly: true,
    });
    if (order.order_type !== "delivery")
      throw new ApiAccessError("This is not a delivery order.", 409);
    if (body.reconcileOrderId) {
      const remoteId = String(body.reconcileOrderId);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(remoteId))
        throw new ApiAccessError("Invalid provider order ID.", 400);
      const { data: attempt, error } = await db
        .from("customer_provider_attempts")
        .select("*")
        .eq("order_id", order.id)
        .eq("provider", "lalamove")
        .in("state", ["creating", "uncertain"])
        .maybeSingle();
      if (error || !attempt)
        throw new ApiAccessError(
          "No delivery attempt requires reconciliation.",
          409,
        );
      const result = await lalamoveRequest<DeliveryResponse>(
        "GET",
        `/v3/orders/${remoteId}`,
      );
      const remote = result.data?.data;
      if (
        result.error ||
        !remote ||
        remote.orderId !== remoteId ||
        remote.metadata?.customerAttemptId !== attempt.id ||
        remote.metadata?.cafeOrderId !== order.id
      ) {
        throw new ApiAccessError(
          "The provider booking does not match this attempt.",
          409,
        );
      }
      await finishProviderAttempt(
        db,
        attempt,
        "ready",
        remoteId,
        safeProviderUrl(remote.shareLink),
      );
      const { error: syncError } = await db.rpc("customer_sync_delivery", {
        p_order: order.id,
        p_remote: remoteId,
        p_status: remote.status,
        p_url: safeProviderUrl(remote.shareLink),
      });
      if (syncError)
        throw new ApiAccessError(
          "The booking was linked but status synchronization needs attention.",
          503,
        );
      return NextResponse.json(
        { success: true, reconciled: true, lalamoveOrderId: remoteId },
        { headers: { ...PRIVATE_HEADERS, ...cors(req) } },
      );
    }
    if (order.lalamove_order_id)
      return NextResponse.json(
        {
          success: true,
          lalamoveOrderId: order.lalamove_order_id,
          reused: true,
        },
        { headers: { ...PRIVATE_HEADERS, ...cors(req) } },
      );
    if (
      order.payment_status !== "paid" ||
      !["preparing", "ready"].includes(order.status)
    )
      throw new ApiAccessError(
        "Paid delivery must be preparing or ready before dispatch.",
        409,
      );
    if (!process.env.LALAMOVE_API_KEY || !process.env.LALAMOVE_API_SECRET)
      throw new ApiAccessError(
        "Delivery dispatch is temporarily unavailable.",
        503,
      );
    const branch = await readCustomerBranch(db);
    if (!withinCoverage(order.delivery_lat, order.delivery_lng, branch))
      throw new ApiAccessError(
        "The delivery address is outside the current cafe delivery area. Review this order before dispatch.",
        409,
      );
    if (
      ![order.delivery_lat, order.delivery_lng].every((value) =>
        Number.isFinite(Number(value)),
      ) ||
      !order.delivery_address ||
      !order.delivery_name ||
      !order.delivery_phone
    ) {
      throw new ApiAccessError(
        "Delivery recipient details are incomplete.",
        409,
      );
    }
    const { claimed, attempt } = await claimProviderAttempt(
      db,
      order.id,
      "lalamove",
      actorId,
    );
    if (!claimed) {
      if (attempt.state === "ready" && attempt.remote_id)
        return NextResponse.json(
          { success: true, lalamoveOrderId: attempt.remote_id, reused: true },
          { headers: PRIVATE_HEADERS },
        );
      pendingAttemptError(attempt);
    }
    // Quotation failure cannot have created a rider booking; only the subsequent POST is uncertain.
    const quote = await lalamoveRequest<QuoteResponse>(
      "POST",
      "/v3/quotations",
      {
        data: {
          serviceType: LALAMOVE_SERVICE_TYPE,
          language: "en_PH",
          stops: [
            {
              coordinates: {
                lat: String(branch.latitude),
                lng: String(branch.longitude),
              },
              address: branch.address,
            },
            {
              coordinates: {
                lat: String(order.delivery_lat),
                lng: String(order.delivery_lng),
              },
              address: order.delivery_address,
            },
          ],
        },
      },
    );
    const q = quote.data?.data;
    if (quote.error) {
      await finishProviderAttempt(
        db,
        attempt,
        "failed",
        null,
        null,
        quote.errorCode || `QUOTE_HTTP_${quote.status}`,
      );
      throw new ApiAccessError(quote.error, 503);
    }
    if (q && q.serviceType !== LALAMOVE_SERVICE_TYPE) {
      await finishProviderAttempt(
        db,
        attempt,
        "failed",
        null,
        null,
        "MOTORCYCLE_QUOTE_REQUIRED",
      );
      throw new ApiAccessError(
        "Lalamove did not return a Motorcycle quote. No rider was booked. Refresh the delivery quote before retrying.",
        409,
      );
    }
    if (
      !q?.quotationId ||
      !q.stops?.[0]?.stopId ||
      !q.stops?.[1]?.stopId ||
      q.priceBreakdown?.currency !== "PHP" ||
      Math.round(Number(q.priceBreakdown?.total) * 100) !==
        Math.round(Number(order.delivery_fee) * 100)
    ) {
      await finishProviderAttempt(
        db,
        attempt,
        "failed",
        null,
        null,
        "QUOTE_UNAVAILABLE_OR_CHANGED",
      );
      throw new ApiAccessError(
        "Delivery quotation is unavailable or its price changed. Review this delivery before dispatch.",
        409,
      );
    }
    const recipientPhone = String(order.delivery_phone).replace(/\D/g, "");
    const booking = {
      data: {
        quotationId: q.quotationId,
        sender: {
          stopId: q.stops[0].stopId,
          name: branch.name,
          phone: branch.contact_phone || PICKUP.phone,
        },
        recipients: [
          {
            stopId: q.stops[1].stopId,
            name: order.delivery_name,
            phone: recipientPhone.startsWith("0")
              ? `+63${recipientPhone.slice(1)}`
              : `+${recipientPhone}`,
            remarks: "Food delivery from Jayds Cafe",
          },
        ],
        isPODEnabled: false,
        metadata: { cafeOrderId: order.id, customerAttemptId: attempt.id },
      },
    };
    const result = await lalamoveRequest<DeliveryResponse>(
      "POST",
      "/v3/orders",
      booking,
      attempt.request_key,
    );
    if (result.error || !result.data?.data?.orderId) {
      const uncertain =
        !result.status ||
        result.status >= 500 ||
        [408, 409, 429].includes(result.status) ||
        !result.error;
      if (uncertain)
        await markUncertain(db, attempt, "BOOKING_RESPONSE_UNCERTAIN");
      else
        await finishProviderAttempt(
          db,
          attempt,
          "failed",
          null,
          null,
          result.errorCode || `PROVIDER_DECLINED_HTTP_${result.status}`,
        );
      throw new ApiAccessError(
        uncertain
          ? "The delivery response needs reconciliation. Contact the cafe before booking again."
          : result.error || "The provider declined this delivery booking.",
        503,
      );
    }
    const remote = result.data.data;
    try {
      await finishProviderAttempt(
        db,
        attempt,
        "ready",
        remote.orderId,
        safeProviderUrl(remote.shareLink),
      );
    } catch (error) {
      await markUncertain(db, attempt, "BOOKING_LINK_UNCERTAIN");
      throw error;
    }
    return NextResponse.json(
      { success: true, lalamoveOrderId: remote.orderId },
      { headers: { ...PRIVATE_HEADERS, ...cors(req) } },
    );
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
