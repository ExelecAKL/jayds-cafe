import {
  CatalogValidationError,
  priceCatalogItems,
  submissionIdentity,
  type SubmittedItem,
} from "@cafeos/shared/inventory/orders";
import {
  cashierError,
  cashierRpc,
  requireCashier,
} from "../../../../lib/server";
import { calculateFinancials } from "@cafeos/shared/finance/calculations";
export async function POST(req: Request) {
  try {
    const { db, actor } = await requireCashier(req);
    if (!req.headers.get("Idempotency-Key"))
      throw new CatalogValidationError(
        "A checkout submission key is required",
        400,
      );
    const body = (await req.json()) as {
      order_id?: string;
      parked_order_id?: string;
      items?: SubmittedItem[];
      customer_id?: string;
      points_redeemed?: number;
      notes?: string;
      cash_received?: number;
      expected_total?: number;
      pickup_qr?: string;
    };
    const identity = submissionIdentity(req, "pos-cash", actor, body);
    const { data: previous, error: lookupError } = await db
      .from("pos_checkout_attempts")
      .select("fingerprint,result")
      .eq("key", identity.key)
      .maybeSingle();
    if (lookupError)
      throw new CatalogValidationError(
        "Apply the POS database upgrade before accepting sales.",
        503,
      );
    if (previous) {
      if (previous.fingerprint !== identity.fingerprint)
        throw new CatalogValidationError(
          "Submission key reused with different data",
        );
      return Response.json(previous.result);
    }
    if (body.pickup_qr !== undefined) {
      if (
        typeof body.cash_received !== "number" ||
        typeof body.expected_total !== "number" ||
        !Number.isFinite(body.cash_received) ||
        !Number.isFinite(body.expected_total)
      )
        throw new CatalogValidationError("Enter a valid cash amount", 400);
      if (
        typeof body.pickup_qr !== "string" ||
        !/^pickup:[a-f0-9-]{36}:[a-zA-Z0-9_-]+$/.test(body.pickup_qr) ||
        body.pickup_qr.length > 512 ||
        body.pickup_qr.split(":")[1] !== body.order_id ||
        body.items ||
        body.parked_order_id
      )
        throw new CatalogValidationError(
          "Scan this order’s ready pickup QR",
          400,
        );
      return Response.json(
        await cashierRpc(db, "pos_cash_pickup", {
          p_actor: actor,
          p_key: identity.key,
          p_fingerprint: identity.fingerprint,
          p_qr: body.pickup_qr,
          p_cash: body.cash_received,
          p_expected: body.expected_total,
        }),
      );
    }
    let order: Record<string, unknown> | null = null;
    let items: Awaited<ReturnType<typeof priceCatalogItems>> | null = null;
    if (body.items) {
      if (
        !Array.isArray(body.items) ||
        !body.items.length ||
        body.items.length > 200
      )
        throw new CatalogValidationError("Add items to the ticket first", 400);
      items = await priceCatalogItems(db, body.items, "base");
      const subtotal =
        Math.round(items.reduce((n, i) => n + i.subtotal, 0) * 100) / 100;
      const points = Number(body.points_redeemed ?? 0);
      if (
        !Number.isSafeInteger(points) ||
        points < 0 ||
        points > Math.floor(subtotal * 10) ||
        (points > 0 && !body.customer_id)
      )
        throw new CatalogValidationError("Invalid points amount", 400);
      order = {
        order_source: "pos",
        order_type: "pickup",
        payment_method: "cash",
        customer_id: body.customer_id || null,
        points_redeemed: points,
        subtotal,
        discount: points / 10,
        financial_breakdown: calculateFinancials({ items, points }),
        total: Math.round((subtotal - points / 10) * 100) / 100,
        notes: body.notes || null,
      };
    } else if (!body.order_id)
      throw new CatalogValidationError(
        "A register draft or unpaid order is required",
        400,
      );
    if (
      typeof body.cash_received !== "number" ||
      typeof body.expected_total !== "number" ||
      !Number.isFinite(body.cash_received) ||
      !Number.isFinite(body.expected_total)
    )
      throw new CatalogValidationError("Enter a valid cash amount", 400);
    const result = await cashierRpc(db, "pos_cash_checkout", {
      p_actor: actor,
      p_key: identity.key,
      p_fingerprint: identity.fingerprint,
      p_cash: body.cash_received,
      p_expected: body.expected_total,
      p_order: order,
      p_items: items,
      p_existing: body.order_id ?? body.parked_order_id ?? null,
    });
    return Response.json(result);
  } catch (error) {
    return cashierError(error);
  }
}
