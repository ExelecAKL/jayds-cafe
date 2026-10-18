export interface TicketTaxSummary {
  item_vat_centavos: number;
  delivery_vat_centavos: number | null;
}

/** Display the accepted immutable snapshot; never infer tax for old orders. */
export function acceptedTicketTax(
  value: unknown,
  orderTotal: number,
): TicketTaxSummary | null {
  if (!value || typeof value !== "object") return null;
  const f = value as Record<string, unknown>;
  const vat = f.vat;
  const deliveryVat = f.delivery_tax ?? null;
  if (
    f.version !== 1 ||
    f.currency !== "PHP" ||
    !Number.isSafeInteger(f.total) ||
    f.total !== Math.round(Number(orderTotal) * 100) ||
    typeof vat !== "number" ||
    !Number.isSafeInteger(vat) ||
    vat < 0 ||
    (deliveryVat !== null &&
      (typeof deliveryVat !== "number" ||
        !Number.isSafeInteger(deliveryVat) ||
        deliveryVat < 0)) ||
    vat + Number(deliveryVat) > Number(f.total)
  )
    return null;
  return {
    item_vat_centavos: vat,
    delivery_vat_centavos: deliveryVat as number | null,
  };
}
