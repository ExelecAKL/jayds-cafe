// apps/pos/components/OrderCard.tsx
// Order card component with items, notes, payment badge, elapsed time

"use client";

import { useState, useEffect } from "react";
import type { Order } from "@cafeos/shared/types";

interface OrderCardProps {
  order: Order;
  onAdvance?: () => void;
  onVoid: () => void;
  nextStatusLabel?: string;
}

function getElapsedTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const hours = Math.floor(diffMins / 60);
  return `${hours}h ${diffMins % 60}m ago`;
}

export function OrderCard({
  order,
  onAdvance,
  onVoid,
  nextStatusLabel,
}: OrderCardProps) {
  const [elapsed, setElapsed] = useState(getElapsedTime(order.created_at));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(getElapsedTime(order.created_at));
    }, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, [order.created_at]);

  return (
    <div className="bg-gray-800 rounded-xl p-3 border border-gray-700 hover:border-gray-600 transition-colors">
      {/* Header: Order number + time */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-semibold text-sm">
          {order.order_number}
        </span>
        <span className="text-gray-500 text-xs">{elapsed}</span>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ${
            order.order_source === "pos"
              ? "bg-amber-500/20 text-amber-400"
              : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {order.order_source === "pos" ? "POS" : "App"}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
          {order.order_type === "dine_in"
            ? "🍽️ Dine-in"
            : order.order_type === "delivery"
              ? "🚚 Delivery"
              : order.order_type === "pickup"
                ? "📦 Pickup"
                : "🥡 Takeout"}
        </span>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ${
            order.payment_status === "paid"
              ? "bg-green-500/20 text-green-400"
              : "bg-yellow-500/20 text-yellow-400"
          }`}
        >
          {order.payment_method === "maya" ? "💳" : "💵"}{" "}
          {order.payment_status === "paid" ? "Paid" : "Unpaid"}
        </span>
      </div>

      {order.is_parked && (
        <p className="text-xs text-amber-300 mb-2">
          Parked · resume to reserve stock
        </p>
      )}
      {order.stock_conflict && (
        <p role="alert" className="text-xs text-red-300 mb-2">
          Stock needs attention · preparation is blocked
        </p>
      )}
      {/* Items */}
      <div className="space-y-1 mb-2">
        {order.items?.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-gray-300">
              {item.quantity}× {item.name}
            </span>
            <span className="text-gray-500">₱{item.subtotal.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="bg-gray-900 rounded-lg p-2 mb-2">
          <p className="text-[10px] text-gray-500">📝 {order.notes}</p>
        </div>
      )}

      {/* Total */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700">
        <span className="text-gray-400 text-xs">Total</span>
        <span className="text-amber-400 font-semibold text-sm">
          ₱{order.total.toFixed(2)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={onVoid}
          className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/20 transition-colors"
        >
          Void
        </button>
        {onAdvance && (
          <button
            onClick={onAdvance}
            className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors"
          >
            {nextStatusLabel || "Advance"}
          </button>
        )}
      </div>
    </div>
  );
}
