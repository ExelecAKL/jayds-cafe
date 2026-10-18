import { calculateFinancials } from "@cafeos/shared/finance/calculations";
import type { CartState } from "../context/CartContext";

export function cartFinancialPreview(cart: CartState, points: number) {
  if (!cart.items.length) return null;
  try {
    return calculateFinancials({
      items: cart.items,
      points,
      promotion: cart.voucher
        ? {
            kind: cart.voucher.discount_type,
            value: cart.voucher.discount_value,
            cap: cart.voucher.max_discount_amount,
            itemIds:
              cart.voucher.application_mode === "selected_items"
                ? (cart.voucher.applicable_item_ids ?? undefined)
                : undefined,
          }
        : undefined,
    });
  } catch {
    return null;
  }
}
