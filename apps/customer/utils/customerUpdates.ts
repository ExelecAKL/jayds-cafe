// apps/customer/utils/customerUpdates.ts
// Turns a customer's own orders and the café's published offers into a
// readable list of updates. Nothing is written to the database; read state
// is kept per account (or guest) on this device.
import type { IconName } from "../components/Icon";

export type UpdateTone = "attention" | "progress" | "done" | "closed" | "offer";
export type CustomerUpdate = {
  id: string;
  kind: "order" | "offer";
  tone: UpdateTone;
  icon: IconName;
  title: string;
  body: string;
  at: string;
  href: string;
};

type OrderLike = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  order_type: string;
  total: number | string;
  created_at: string;
  updated_at?: string | null;
  expires_at?: string | null;
  is_parked?: boolean | null;
};
type OfferLike = {
  id: string;
  code: string;
  description?: string | null;
  discount_type: string;
  discount_value: number | string;
  created_at: string;
};

const peso = (value: number | string) => `₱${Number(value).toFixed(2)}`;

export function orderUpdate(order: OrderLike): CustomerUpdate | null {
  if (order.is_parked) return null;
  const at = order.updated_at || order.created_at;
  const base = {
    kind: "order" as const,
    at,
    href: `/orders/${order.id}`,
  };
  const number = order.order_number;
  const delivery = order.order_type === "delivery";
  const unpaidMaya =
    order.payment_method === "maya" &&
    ["pending", "failed"].includes(order.payment_status) &&
    !["cancelled", "completed"].includes(order.status);
  const key = `${order.id}:${order.status}:${order.payment_status}`;
  if (order.payment_status === "refunded")
    return {
      ...base,
      id: key,
      tone: "closed",
      icon: "wallet",
      title: `Refund recorded for ${number}`,
      body: `${peso(order.total)} is being returned to your original payment method.`,
    };
  if (unpaidMaya && order.expires_at && Date.parse(order.expires_at) < Date.now())
    return {
      ...base,
      id: key + ":expired",
      tone: "closed",
      icon: "clock",
      title: `Payment window closed for ${number}`,
      body: "Start a new order when you’re ready. Nothing was charged.",
    };
  if (unpaidMaya)
    return {
      ...base,
      id: key,
      tone: "attention",
      icon: "wallet",
      title: `Finish your Maya payment for ${number}`,
      body: `${peso(order.total)} due${
        order.expires_at
          ? ` by ${new Date(order.expires_at).toLocaleTimeString("en-PH", {
              timeZone: "Asia/Manila",
              hour: "numeric",
              minute: "2-digit",
            })}`
          : ""
      }. The café starts once Maya confirms it.`,
    };
  switch (order.status) {
    case "pending":
      return {
        ...base,
        id: key,
        tone: "progress",
        icon: "clock",
        title: `${number} is waiting for the café`,
        body: "We’ll let you know as soon as it’s confirmed.",
      };
    case "confirmed":
      return {
        ...base,
        id: key,
        tone: "progress",
        icon: "check",
        title: `${number} is confirmed`,
        body: "Your order is in the queue. Preparation starts shortly.",
      };
    case "preparing":
      return {
        ...base,
        id: key,
        tone: "progress",
        icon: "coffee",
        title: `We’re making ${number}`,
        body: delivery
          ? "Your order is being prepared for the courier."
          : "Your order is being prepared. We’ll tell you when it’s ready.",
      };
    case "ready":
      return {
        ...base,
        id: key,
        tone: "attention",
        icon: delivery ? "truck" : "bag",
        title: delivery ? `${number} is ready for dispatch` : `${number} is ready to collect`,
        body: delivery
          ? "The courier is on the way to pick it up."
          : "Show your pickup code at the counter.",
      };
    case "completed":
      return {
        ...base,
        id: key,
        tone: "done",
        icon: "heart",
        title: `Enjoy! ${number} is complete`,
        body: "Thanks for choosing Jayds. You can order it again anytime.",
      };
    case "cancelled":
      return {
        ...base,
        id: key,
        tone: "closed",
        icon: "close",
        title: `${number} was cancelled`,
        body: "Open the order for details. Any payment follows café review.",
      };
    default:
      return null;
  }
}

export function offerUpdate(offer: OfferLike): CustomerUpdate {
  const value =
    offer.discount_type === "percentage"
      ? `${Number(offer.discount_value)}% off`
      : `${peso(offer.discount_value)} off`;
  return {
    id: `offer:${offer.id}`,
    kind: "offer",
    tone: "offer",
    icon: "star",
    title: `New offer: ${value} with ${offer.code}`,
    body: offer.description || "A new voucher is waiting in your wallet.",
    at: offer.created_at,
    href: "/vouchers",
  };
}

const FRESH_DAYS = 7;
/** Only recent updates can be "new"; older history never nags. */
export function isUnread(
  update: CustomerUpdate,
  read: Set<string>,
  now = Date.now(),
) {
  return (
    !read.has(update.id) &&
    now - Date.parse(update.at) < FRESH_DAYS * 86_400_000
  );
}

export function sortUpdates(updates: CustomerUpdate[]) {
  return [...updates].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

const readKey = (owner: string) => `jayds-customer-updates-read:v1:${owner}`;
export function readUpdateIds(owner: string): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(readKey(owner)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}
export function saveUpdateIds(owner: string, ids: Set<string>) {
  try {
    localStorage.setItem(readKey(owner), JSON.stringify([...ids].slice(-300)));
  } catch {
    // Without storage, read state lasts for this visit only.
  }
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.round(Math.max(0, now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}
