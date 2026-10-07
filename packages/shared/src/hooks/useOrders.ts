// packages/shared/src/hooks/useOrders.ts
// useOrders() - Realtime order list subscription
// useOrder() - Single order tracking with realtime updates

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase/client";
import { createUuid } from "../utils/uuid";
import type { Order, OrderStatus } from "../types/index";

type OrderItemMode = "none" | "count" | "full";

interface UseOrdersOptions {
  customerId?: string;
  statuses?: OrderStatus[];
  limit?: number;
  enabled?: boolean;
  includeCustomer?: boolean;
  includeStatusHistory?: boolean;
  itemMode?: OrderItemMode;
}

interface UseOrderOptions {
  enabled?: boolean;
  includeCustomer?: boolean;
  includeStatusHistory?: boolean;
  itemMode?: OrderItemMode;
}

const ORDER_BASE_SELECT = `
  id,
  order_number,
  customer_id,
  status,
  order_type,
  order_source,
  is_parked,
  stock_conflict,
  inventory_managed,
  inventory_consumed,
  payment_method,
  payment_status,
  subtotal,
  total,
  discount,
  points_earned,
  points_redeemed,
  notes,
  maya_checkout_id,
  maya_checkout_url,
  maya_payment_id,
  staff_id,
  delivery_address,
  delivery_fee,
  delivery_lat,
  delivery_lng,
  lalamove_order_id,
  lalamove_quotation_id,
  lalamove_status,
  lalamove_share_link,
  expires_at,
  pickup_confirmation_hash,
  advance_order_key,
  created_at,
  updated_at
`;

function buildOrderSelect(options: {
  includeCustomer: boolean;
  includeStatusHistory: boolean;
  itemMode: OrderItemMode;
}) {
  const parts = [ORDER_BASE_SELECT.trim()];

  if (options.itemMode === "count") {
    parts.push("items:order_items(id)");
  } else if (options.itemMode === "full") {
    parts.push(
      `
      items:order_items(
        id,
        order_id,
        menu_item_id,
        name,
        price,
        quantity,
        variants,
        subtotal,
        notes,
        created_at
      )
    `.trim(),
    );
  }

  if (options.includeCustomer) {
    parts.push(
      "customer:profiles!orders_customer_id_fkey(id, full_name, email)",
    );
  }

  if (options.includeStatusHistory) {
    parts.push(
      `
      status_history:order_status_history(
        id,
        order_id,
        previous_status,
        new_status,
        changed_by,
        notes,
        created_at
      )
    `.trim(),
    );
  }

  return parts.join(", ");
}

/**
 * Subscribe to orders in realtime.
 * If customerId is provided, only shows that customer's orders.
 * If statuses is provided, filters by those statuses.
 */
export function useOrders(options: UseOrdersOptions = {}) {
  const {
    customerId,
    statuses,
    limit = 50,
    enabled = true,
    includeCustomer = true,
    includeStatusHistory = false,
    itemMode = "full",
  } = options;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const statusFilterKey = statuses?.join("|") ?? "";
  const select = buildOrderSelect({
    includeCustomer,
    includeStatusHistory,
    itemMode,
  });

  const fetchOrders = useCallback(async () => {
    if (!enabled) {
      setOrders([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      // Background realtime updates should not cause full-page loading spinners.
      // Initial loading state is already true via useState(enabled).

      let query = supabase
        .from("orders")
        .select(select)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (customerId) {
        query = query.eq("customer_id", customerId);
      }

      if (statusFilterKey) {
        query = query.in("status", statusFilterKey.split("|") as OrderStatus[]);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setOrders((data as unknown as Order[]) || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, [customerId, enabled, limit, select, statusFilterKey]);

  useEffect(() => {
    void Promise.resolve().then(fetchOrders);

    if (!enabled) {
      return;
    }

    const channel = supabase.channel("orders-realtime-" + createUuid());

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
      },
      () => {
        void fetchOrders();
      },
    );

    if (itemMode !== "none") {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
        },
        () => {
          void fetchOrders();
        },
      );
    }

    if (includeStatusHistory) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_status_history",
        },
        () => {
          void fetchOrders();
        },
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") void fetchOrders();
    });
    const timer = setInterval(() => {
      if (navigator.onLine) void fetchOrders();
    }, 30_000);
    const recover = () => {
      if (navigator.onLine) void fetchOrders();
    };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);

    return () => {
      clearInterval(timer);
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
      supabase.removeChannel(channel);
    };
  }, [enabled, fetchOrders, includeStatusHistory, itemMode]);

  return { orders, loading, error, refetch: fetchOrders };
}

/**
 * Track a single order by ID with realtime updates.
 */
export function useOrder(
  orderId: string | null,
  options: UseOrderOptions = {},
) {
  const {
    enabled = true,
    includeCustomer = true,
    includeStatusHistory = true,
    itemMode = "full",
  } = options;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const select = buildOrderSelect({
    includeCustomer,
    includeStatusHistory,
    itemMode,
  });

  const fetchOrder = useCallback(async () => {
    if (!orderId || !enabled) {
      setOrder(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      // Background realtime updates should not cause full-page loading spinners.
      // Initial loading state is already true via useState(enabled).

      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(select)
        .eq("id", orderId)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setOrder(data as unknown as Order);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch order");
    } finally {
      setLoading(false);
    }
  }, [enabled, orderId, select]);

  useEffect(() => {
    void Promise.resolve().then(fetchOrder);

    if (!orderId || !enabled) {
      return;
    }

    const channel = supabase.channel(`order-${orderId}`);

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${orderId}`,
      },
      () => {
        void fetchOrder();
      },
    );

    if (itemMode !== "none") {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          void fetchOrder();
        },
      );
    }

    if (includeStatusHistory) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_status_history",
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          void fetchOrder();
        },
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") void fetchOrder();
    });
    const timer = setInterval(() => {
      if (navigator.onLine) void fetchOrder();
    }, 30_000);
    const recover = () => {
      if (navigator.onLine) void fetchOrder();
    };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);

    return () => {
      clearInterval(timer);
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
      supabase.removeChannel(channel);
    };
  }, [enabled, fetchOrder, includeStatusHistory, itemMode, orderId]);

  return { order, loading, error, refetch: fetchOrder };
}
