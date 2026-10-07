import { CatalogValidationError } from "@cafeos/shared/inventory/orders";
import {
  cashierError,
  cashierRpc,
  requireCashier,
} from "../../../../lib/server";
export async function POST(req: Request) {
  try {
    const { db, actor } = await requireCashier(req);
    const body = (await req.json()) as { qr?: unknown };
    if (
      typeof body.qr !== "string" ||
      body.qr.length > 512 ||
      !/^(pickup|cached):[a-f0-9-]{36}:[a-zA-Z0-9_-]+$/.test(body.qr)
    )
      throw new CatalogValidationError("Invalid pickup QR", 400);
    return Response.json(
      await cashierRpc(db, "pos_pickup", { p_actor: actor, p_qr: body.qr }),
    );
  } catch (error) {
    return cashierError(error);
  }
}
