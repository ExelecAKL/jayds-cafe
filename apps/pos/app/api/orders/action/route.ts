import { CatalogValidationError } from "@cafeos/shared/inventory/orders";
import {
  cashierError,
  cashierRpc,
  requireCashier,
} from "../../../../lib/server";
export async function POST(req: Request) {
  try {
    const { db, actor } = await requireCashier(req);
    const body = (await req.json()) as {
      order_id?: string;
      action?: string;
      expected_status?: string;
    };
    if (
      !body.order_id ||
      !body.action ||
      !["confirm", "prepare", "ready", "collect", "receipt"].includes(
        body.action,
      )
    )
      throw new CatalogValidationError("Invalid order action", 400);
    return Response.json(
      await cashierRpc(db, "pos_order_action", {
        p_actor: actor,
        p_order: body.order_id,
        p_action: body.action,
        p_expected: body.expected_status ?? null,
      }),
    );
  } catch (error) {
    return cashierError(error);
  }
}
