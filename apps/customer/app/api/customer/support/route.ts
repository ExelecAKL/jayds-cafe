import { NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import {
  requireCustomer,
  requireOrderAccess,
  getServerDb,
  guestDeviceHash,
  assertSameOrigin,
  ApiAccessError,
  apiAccessErrorResponse,
} from "../../../../lib/server-access";
export async function GET(req: Request) {
  try {
    const db = getServerDb();
    let query = db
      .from("customer_support_cases")
      .select(
        "id,order_id,kind,subject,message,status,response,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (req.headers.has("authorization"))
      query = query.eq("user_id", (await requireCustomer(req)).userId);
    else {
      const orderId = new URL(req.url).searchParams.get("orderId");
      const access = await requireOrderAccess(req, orderId, {
        scope: "read",
        db,
      });
      query = query.eq("guest_hash", access.guestHash).eq("order_id", orderId);
    }
    const { data, error } = await query;
    if (error)
      throw new ApiAccessError("Support requests could not load.", 503);
    return NextResponse.json(
      { cases: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiAccessErrorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await readJsonBody(req);
    if (
      !["order", "privacy", "refund", "account"].includes(body.kind) ||
      typeof body.subject !== "string" ||
      !body.subject.trim() ||
      body.subject.length > 150 ||
      typeof body.message !== "string" ||
      !body.message.trim() ||
      body.message.length > 4000
    )
      throw new ApiAccessError(
        "Enter a subject and message within the displayed limits.",
        400,
      );
    const db = getServerDb();
    let userId: string | null = null,
      guestHash: string | null = null;
    if (req.headers.has("authorization"))
      userId = (await requireCustomer(req)).userId;
    if (body.orderId) {
      const access = await requireOrderAccess(req, body.orderId, {
        scope: "manage",
        db,
      });
      if (!userId) guestHash = access.guestHash;
    }
    if (!userId && !guestHash)
      throw new ApiAccessError(
        "Sign in or use an order from your original guest device. Privacy requests can also be made by phone.",
        401,
      );
    const { data, error } = await db
      .from("customer_support_cases")
      .insert({
        user_id: userId,
        guest_hash: guestHash ?? guestDeviceHash(req),
        order_id: body.orderId || null,
        kind: body.kind,
        subject: body.subject.trim(),
        message: body.message.trim(),
      })
      .select("id")
      .single();
    if (error)
      throw new ApiAccessError(
        "Your request could not save. Your message is still available to retry.",
        503,
      );
    return NextResponse.json({ id: data.id });
  } catch (e) {
    return apiAccessErrorResponse(e);
  }
}
