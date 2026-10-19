import { Icon } from "./Operations";
import { DetailSkeleton } from "./AdminSkeletons";
import { useState, useEffect } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type {
  Order,
  OrderItem,
  OrderStatus,
  Profile,
} from "@cafeos/shared/types";
import { menuProductImageUrl } from "@cafeos/shared/utils/product-images";
import { AdminDialog } from "./AdminDialog";

interface OrderDetailsModalProps {
  orderId: string;
  onClose: () => void;
}

type DetailedOrder = Omit<Order, "items" | "customer"> & {
  customer?: Pick<Profile, "full_name" | "phone" | "email"> | null;
  items?: (OrderItem & { menu_item?: { image_url: string | null } | null })[];
};

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-warning-soft text-warning",
  confirmed: "bg-info-soft text-info",
  preparing: "bg-info-soft text-info",
  ready: "bg-success-soft text-success",
  completed: "bg-success-soft text-success",
  cancelled: "bg-danger-soft text-danger",
};

export function OrderDetailsModal({
  orderId,
  onClose,
}: OrderDetailsModalProps) {
  const [order, setOrder] = useState<DetailedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  const maskString = (str: string | null | undefined, isEmail = false) => {
    if (!str) return " - ";
    if (isEmail) {
      const [local, domain] = str.split("@");
      if (!domain) return str;
      return `${local.substring(0, 2)}***@${domain}`;
    }
    // Mask phone e.g. +63 912 345 6789 -> +63 912 *** ****
    if (str.length > 6) return str.substring(0, str.length - 6) + "*** ****";
    return "***";
  };

  useEffect(() => {
    async function fetchDetails() {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          customer:profiles!orders_customer_id_fkey(full_name, phone, email),
          items:order_items(
            id, menu_item_id, name, price, quantity, variants, subtotal, notes,
            menu_item:menu_items(image_url)
          )
        `,
        )
        .eq("id", orderId)
        .single();

      if (!error && data) {
        setOrder(data as DetailedOrder);
      }
      setLoading(false);
    }
    void fetchDetails();
  }, [orderId]);

  return (
    <AdminDialog
      title="Order Details"
      onClose={onClose}
      className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <div className="px-6 py-4 border-b border-subtle flex items-center justify-between bg-raised">
        <h3 className="font-bold text-ink">Order Details</h3>
        <button
          aria-label="Close dialog"
          onClick={onClose}
          className="text-muted hover:text-muted font-bold p-2"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="p-6 overflow-y-auto flex-1">
        {loading ? (
          <DetailSkeleton label="Loading order details…" fields={6} lines={3} />
        ) : !order ? (
          <div className="text-center py-10 text-muted">
            Order could not be loaded.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Info */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-subtle pb-4">
              <div>
                <h1 className="text-3xl font-black text-ink mb-1">
                  {order.order_number}
                </h1>
                <p className="text-sm text-muted">
                  {new Date(order.created_at).toLocaleString("en-PH", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${statusColors[order.status as OrderStatus]}`}
                >
                  {order.status}
                </span>
                <p className="text-sm font-medium text-ink uppercase">
                  {order.order_source === "pos" ? "POS" : "App"} ·{" "}
                  {order.order_type.replace("_", " ")}
                </p>
                <p
                  className={`text-xs font-bold uppercase mt-1 ${order.payment_status === "paid" ? "text-success" : "text-warning"}`}
                >
                  {order.payment_method === "maya" ? "MAYA " : "CASH "} ·{" "}
                  {order.payment_status}
                </p>
              </div>
            </div>

            {/* Customer Info */}
            <div className="bg-raised rounded-xl p-4 border border-subtle">
              <h4 className="text-xs font-bold text-muted tracking-wider uppercase mb-3 flex items-center justify-between">
                Customer Information
                <button
                  onClick={() => setRevealed(!revealed)}
                  className="text-xs bg-raised text-ink px-2 py-0.5 rounded-full hover:bg-raised transition-colors"
                >
                  {revealed ? "Hide Data" : "Reveal Data"}
                </button>
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted block mb-1">
                    Name
                  </label>
                  <p className="font-medium text-ink">
                    {order.customer?.full_name || "Walk-in Customer"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">
                    Contact
                  </label>
                  <p className="font-medium text-ink font-mono text-sm">
                    {revealed
                      ? order.customer?.phone || order.customer?.email || " - "
                      : maskString(
                          order.customer?.phone || order.customer?.email,
                          !order.customer?.phone,
                        )}
                  </p>
                </div>
              </div>
              {order.notes && (
                <div className="mt-4 pt-4 border-t border-subtle/60">
                  <label className="text-xs text-muted block mb-1">
                    Order Notes
                  </label>
                  <p className="text-sm text-ink italic bg-warning-soft/50 p-3 rounded-lg border border-warning-border/50">
                    {order.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Order Items */}
            <div>
              <h4 className="text-xs font-bold text-muted tracking-wider uppercase mb-3">
                Receipt Breakdown
              </h4>
              <div className="space-y-3">
                {order.items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-4 p-4 rounded-xl border border-subtle bg-surface shadow-sm"
                  >
                    <div className="w-12 h-12 bg-raised rounded-lg flex-shrink-0 overflow-hidden">
                      {menuProductImageUrl(
                        item.menu_item_id,
                        item.menu_item?.image_url,
                      ) ? (
                        <img
                          src={menuProductImageUrl(
                            item.menu_item_id,
                            item.menu_item?.image_url,
                          )!}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">
                          <Icon name="coffee" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <p className="font-bold text-ink">
                          {item.name}{" "}
                          <span className="text-muted font-normal">
                            x{item.quantity}
                          </span>
                        </p>
                        <p className="font-bold text-ink">
                          ₱{item.subtotal.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-xs text-muted flex items-center gap-2 mb-2">
                        <span>Base: ₱{item.price.toFixed(2)} ea</span>
                      </div>

                      {/* Variants List */}
                      {item.variants && item.variants.length > 0 && (
                        <div className="mt-2 space-y-1 pl-2 border-l-2 border-warning-border">
                          {item.variants.map((v, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between text-xs text-muted"
                            >
                              <span>
                                + {v.variant_group}: {v.label}
                              </span>
                              <span>
                                ₱
                                {v.price_modifier > 0
                                  ? v.price_modifier.toFixed(2)
                                  : "0.00"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.notes && (
                        <p className="text-xs mt-2 text-danger italic">
                          &ldquo;{item.notes}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="border-t border-subtle pt-4 flex flex-col items-end text-sm space-y-2">
              <div className="flex justify-between w-48 text-muted">
                <span>Subtotal</span>
                <span>₱{order.subtotal?.toFixed(2) || "0.00"}</span>
              </div>
              {order.points_earned > 0 && (
                <div className="flex justify-between w-48 text-warning">
                  <span>Points Earned</span>
                  <span>+{order.points_earned}<Icon name="star" /></span>
                </div>
              )}
              {order.points_redeemed > 0 && (
                <div className="flex justify-between w-48 text-success">
                  <span>Points Redeemed</span>
                  <span>-{order.points_redeemed} pts</span>
                </div>
              )}
              <div className="flex justify-between w-48 text-lg font-black text-ink pt-2 border-t border-subtle">
                <span>Total</span>
                <span>₱{order.total?.toFixed(2) || "0.00"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminDialog>
  );
}
