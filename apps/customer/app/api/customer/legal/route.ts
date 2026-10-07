import { NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import {
  requireCustomer,
  apiAccessErrorResponse,
  assertSameOrigin,
} from "../../../../lib/server-access";
import { LEGAL_VERSION } from "../../../../lib/legal";
export async function GET(req: Request) {
  try {
    const { db, userId } = await requireCustomer(req);
    const { data, error } = await db
      .from("legal_acknowledgements")
      .select("version,acknowledged_at")
      .eq("user_id", userId)
      .eq("version", LEGAL_VERSION)
      .maybeSingle();
    if (error) throw new Error("Legal acknowledgement unavailable");
    return NextResponse.json(
      { version: LEGAL_VERSION, acknowledged: !!data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiAccessErrorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { db, userId } = await requireCustomer(req);
    const body = await readJsonBody(req);
    if (body.version !== LEGAL_VERSION || body.acknowledged !== true)
      return NextResponse.json(
        { error: "Review the current Terms and Privacy Notice." },
        { status: 400 },
      );
    const { error } = await db
      .from("legal_acknowledgements")
      .upsert(
        { user_id: userId, version: LEGAL_VERSION, source: "customer_review" },
        { onConflict: "user_id,version", ignoreDuplicates: true },
      );
    if (error) throw new Error("Acknowledgement could not save");
    return NextResponse.json({ ok: true, version: LEGAL_VERSION });
  } catch (e) {
    return apiAccessErrorResponse(e);
  }
}
