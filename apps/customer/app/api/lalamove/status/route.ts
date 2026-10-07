import { NextRequest, NextResponse } from "next/server";
import { lalamoveRequest } from "../lib";
import {
  ApiAccessError,
  PRIVATE_HEADERS,
  apiAccessErrorResponse,
  requireOrderAccess,
} from "../../../../lib/server-access";
import { safeProviderUrl } from "../../../../lib/provider-attempts";

interface DeliveryDetail {
  data: {
    orderId: string;
    status: string;
    shareLink?: string;
    driverId?: string;
  };
}
interface DriverDetail {
  data: { name: string; phone: string; plateNumber: string; photo?: string };
}
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const { db, order } = await requireOrderAccess(
      req,
      params.get("dbOrderId"),
      { scope: "read", allowStaff: true },
    );
    const remoteId = order.lalamove_order_id;
    if (!remoteId || !/^[a-zA-Z0-9_-]{1,128}$/.test(String(remoteId)))
      throw new ApiAccessError("This order has no linked delivery.", 404);
    if (params.has("orderId") && params.get("orderId") !== remoteId)
      throw new ApiAccessError("Delivery association does not match.", 403);
    const result = await lalamoveRequest<DeliveryDetail>(
      "GET",
      `/v3/orders/${remoteId}`,
    );
    const remote = result.data?.data;
    if (result.error || !remote || remote.orderId !== remoteId)
      throw new ApiAccessError(
        "Delivery status is temporarily unavailable.",
        503,
      );
    const { data: sync, error } = await db.rpc("customer_sync_delivery", {
      p_order: order.id,
      p_remote: remoteId,
      p_status: remote.status,
      p_url: safeProviderUrl(remote.shareLink),
    });
    if (error)
      throw new ApiAccessError(
        "Delivery status synchronization is temporarily unavailable.",
        503,
      );
    let driver = null;
    if (
      ["ON_GOING", "PICKED_UP"].includes(remote.status) &&
      remote.driverId &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(remote.driverId)
    ) {
      const driverResult = await lalamoveRequest<DriverDetail>(
        "GET",
        `/v3/orders/${remoteId}/drivers/${remote.driverId}`,
      );
      const detail = driverResult.data?.data;
      if (detail)
        driver = {
          name: detail.name,
          phone: detail.phone,
          plateNumber: detail.plateNumber,
          photo: safeProviderUrl(detail.photo),
        };
    }
    return NextResponse.json(
      {
        status: sync?.status ?? remote.status,
        shareLink: safeProviderUrl(remote.shareLink),
        driver,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return apiAccessErrorResponse(error);
  }
}
