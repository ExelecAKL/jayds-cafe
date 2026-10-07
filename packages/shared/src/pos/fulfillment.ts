/** ASAP mobile pickup is paid and collected at the counter in one operation. */
export function cashAtPickup(order: {
  order_source?: string;
  order_type?: string;
  payment_method?: string;
  pickup_window_start?: string | null;
}) {
  return (
    order.order_source === "app" &&
    order.order_type === "pickup" &&
    order.payment_method === "cash" &&
    !order.pickup_window_start
  );
}
