"use client";
// apps/admin/components/notifications/AdminNotifications.tsx
// The Admin notification feed. Every alert is derived from records the
// back office already reads (stock, batches, orders, help requests, staff
// approvals, POS cancellations), so nothing new is written to the database.
// Read state and preferences stay on this device, per signed-in admin.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import type { StockBatch } from "@cafeos/shared/inventory/types";
import {
  useOperations,
  type IconName,
  type OperationalStock,
} from "../Operations";
import { notifyAdmin } from "../AdminToasts";

export type NotificationCategory = "orders" | "stock" | "customers" | "team";
export type NotificationSeverity = "danger" | "warning" | "info";
export type AdminNotification = {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  icon: IconName;
  title: string;
  description: string;
  /** When the event happened. Ongoing conditions (low stock) have none. */
  at: string | null;
  href: string;
  actionLabel: string;
  /** Set on a summary row: the alerts it stands for in the bell panel. */
  members?: string[];
};
type Source =
  | "blockedOrders"
  | "paymentReviews"
  | "help"
  | "staff"
  | "cancellations"
  | "newOrders";
type Preferences = {
  read: string[];
  muted: NotificationCategory[];
  popups: boolean;
};

export const categoryLabels: Record<NotificationCategory, string> = {
  orders: "Orders",
  stock: "Stock",
  customers: "Customers",
  team: "Team",
};
const allSources: Source[] = [
  "blockedOrders",
  "paymentReviews",
  "help",
  "staff",
  "cancellations",
  "newOrders",
];
const sourceLabels: Record<Source, string> = {
  blockedOrders: "blocked orders",
  paymentReviews: "payment reviews",
  help: "help requests",
  staff: "staff approvals",
  cancellations: "POS cancellations",
  newOrders: "new orders",
};
const severityRank: Record<NotificationSeverity, number> = {
  danger: 0,
  warning: 1,
  info: 2,
};
const READ_LIMIT = 600;
const POLL_INTERVAL = 60_000;
const REFRESH_DEBOUNCE = 900;
const EXPIRY_WINDOW_DAYS = 3;
const RECENT_ORDER_HOURS = 12;
const CANCELLATION_HOURS = 48;

const peso = (value: unknown) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0,
  );
const amount = (value: unknown) =>
  new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(
    Number(value) || 0,
  );
function manilaDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    date,
  );
}
function expiryPhrase(expiresOn: string) {
  const today = manilaDate();
  if (expiresOn < today) return "expired";
  if (expiresOn === today) return "expires today";
  if (expiresOn === manilaDate(1)) return "expires tomorrow";
  const days = Math.round(
    (Date.parse(expiresOn) - Date.parse(today)) / 86_400_000,
  );
  return `expires in ${days} days`;
}
const orderType = (value: unknown) =>
  String(value || "order")
    .replace("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());

function storageKey(userId: string) {
  return `jayds-admin-notifications:v1:${userId}`;
}
function readPreferences(userId: string | undefined): Preferences {
  const fallback: Preferences = { read: [], muted: [], popups: true };
  if (!userId) return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      read: Array.isArray(parsed.read) ? parsed.read.slice(-READ_LIMIT) : [],
      muted: Array.isArray(parsed.muted)
        ? parsed.muted.filter((value) => value in categoryLabels)
        : [],
      popups: parsed.popups !== false,
    };
  } catch {
    return fallback;
  }
}
function writePreferences(userId: string | undefined, value: Preferences) {
  if (!userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(value));
  } catch {
    // Private windows can refuse storage; preferences then last this visit.
  }
}

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");
function relation(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row) ?? null;
  return value && typeof value === "object" ? (value as Row) : null;
}

/**
 * Stock alerts come from the operations data the stock-aware pages already
 * load (Overview, Stock, Buying, Menu, Hours). Other pages deliberately never
 * read the stock workspace, so the last result is remembered for the session.
 */
function stockAlerts(
  stock: OperationalStock[],
  batches: StockBatch[],
): AdminNotification[] {
  const items: AdminNotification[] = [];
  const names = new Map(stock.map((row) => [row.id, row.name]));
  for (const row of stock) {
    if (row.is_active === false) continue;
    const available = Number(row.available_stock);
    const minimum = Number(row.min_stock_alert);
    if (!(available <= minimum)) continue;
    const out = available <= 0;
    items.push({
      id: `stock:${row.id}:${out ? "out" : "low"}`,
      category: "stock",
      severity: out ? "danger" : "warning",
      icon: out ? "alert" : "stock",
      title: `${row.name || "An ingredient"} ${out ? "is out of stock" : "is running low"}`,
      description:
        `${amount(available)} ${row.unit ?? ""} available · alert level ${amount(minimum)} ${row.unit ?? ""}`
          .replace(/\s+/g, " ")
          .trim(),
      at: null,
      href: "/inventory?filter=low",
      actionLabel: "Review stock",
    });
  }
  const horizon = manilaDate(EXPIRY_WINDOW_DAYS);
  for (const row of batches) {
    if (!row.expires_on || Number(row.quantity) <= 0) continue;
    if (row.expires_on > horizon) continue;
    const phrase = expiryPhrase(row.expires_on);
    items.push({
      id: `expiry:${row.id}:${phrase === "expired" ? "expired" : "soon"}`,
      category: "stock",
      severity: phrase === "expired" ? "danger" : "warning",
      icon: "calendar",
      title: `${names.get(row.ingredient_id) || "A stock batch"} ${phrase}`,
      description: `Batch ${row.batch_code || "without a code"} · ${amount(row.quantity)} left`,
      at: null,
      href: "/inventory?filter=expiry",
      actionLabel: "Check batches",
    });
  }
  return items;
}
const STOCK_CACHE = "jayds-admin-stock-alerts:v1";
function readStockCache(): { items: AdminNotification[]; at: string } | null {
  try {
    const raw = window.sessionStorage.getItem(STOCK_CACHE);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}
function writeStockCache(items: AdminNotification[], at: string) {
  try {
    window.sessionStorage.setItem(STOCK_CACHE, JSON.stringify({ items, at }));
  } catch {
    // Storage can be unavailable; the alerts then last until reload.
  }
}
function sortFeed(items: AdminNotification[]) {
  return [...items].sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      (b.at ? Date.parse(b.at) : Infinity) -
        (a.at ? Date.parse(a.at) : Infinity) ||
      a.title.localeCompare(b.title),
  );
}

async function loadFeed() {
  const since = (hours: number) =>
    new Date(Date.now() - hours * 3_600_000).toISOString();
  const results = await withRequestDeadline((signal) =>
    Promise.all([
      supabase
        .from("orders")
        .select("id,order_number,total,created_at,updated_at")
        .eq("stock_conflict", true)
        .in("status", ["pending", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(30)
        .abortSignal(signal),
      supabase
        .from("orders")
        .select("id,order_number,payment_review_reason,created_at,updated_at")
        .eq("payment_review_required", true)
        .order("created_at", { ascending: false })
        .limit(30)
        .abortSignal(signal),
      supabase
        .from("customer_support_cases")
        .select("id,kind,subject,status,created_at,updated_at")
        .in("status", ["open", "in_review"])
        .order("created_at", { ascending: false })
        .limit(40)
        .abortSignal(signal),
      supabase
        .from("profiles")
        .select("id,full_name,email,created_at")
        .eq("role", "staff")
        .eq("is_approved", false)
        .order("created_at", { ascending: false })
        .limit(30)
        .abortSignal(signal),
      supabase
        .from("void_logs")
        .select(
          "id,created_at,staff:profiles!void_logs_staff_id_fkey(full_name,email),order:orders!void_logs_order_id_fkey(order_number)",
        )
        .gte("created_at", since(CANCELLATION_HOURS))
        .order("created_at", { ascending: false })
        .limit(20)
        .abortSignal(signal),
      supabase
        .from("orders")
        .select("id,order_number,total,order_type,order_source,created_at")
        .gte("created_at", since(RECENT_ORDER_HOURS))
        .eq("is_parked", false)
        .order("created_at", { ascending: false })
        .limit(20)
        .abortSignal(signal),
    ]),
  );
  const [blocked, reviews, help, staff, cancellations, recent] = results;
  const failed: Source[] = [];
  const rows = (
    source: Source,
    result: { data: unknown; error: unknown },
  ): Row[] => {
    if (result.error || !Array.isArray(result.data)) {
      failed.push(source);
      return [];
    }
    return result.data as Row[];
  };
  const items: AdminNotification[] = [];
  for (const row of rows("blockedOrders", blocked))
    items.push({
      id: `blocked:${row.id}`,
      category: "orders",
      severity: "danger",
      icon: "orders",
      title: `Order ${text(row.order_number)} is blocked by stock`,
      description: `${peso(row.total)} · resolve the stock shortage so the café can prepare it`,
      at: text(row.updated_at) || text(row.created_at) || null,
      href: "/orders?filter=stock_conflict",
      actionLabel: "Open blocked orders",
    });
  for (const row of rows("paymentReviews", reviews))
    items.push({
      id: `payment-review:${row.id}`,
      category: "orders",
      severity: "warning",
      icon: "receipt",
      title: `Payment check needed for ${text(row.order_number)}`,
      description:
        text(row.payment_review_reason) ||
        "This order's payment needs a manual review.",
      at: text(row.updated_at) || text(row.created_at) || null,
      href: "/customer-care",
      actionLabel: "Review payment",
    });
  for (const row of rows("help", help)) {
    const open = row.status === "open";
    items.push({
      id: `help:${row.id}:${row.status}`,
      category: "customers",
      severity: open ? "warning" : "info",
      icon: "support",
      title: open
        ? `New ${text(row.kind) || "customer"} request`
        : "Help request still in review",
      description: text(row.subject) || "A customer asked for help.",
      at: text(row.created_at) || null,
      href: "/customer-care",
      actionLabel: open ? "Reply to customer" : "Continue review",
    });
  }
  for (const row of rows("staff", staff))
    items.push({
      id: `staff:${row.id}`,
      category: "team",
      severity: "warning",
      icon: "userCheck",
      title: `${text(row.full_name) || text(row.email) || "A team member"} is waiting for access`,
      description: "Approve or decline their staff account before their shift.",
      at: text(row.created_at) || null,
      href: "/staff-accounts",
      actionLabel: "Review access",
    });
  for (const row of rows("cancellations", cancellations)) {
    const person = relation(row.staff);
    const order = relation(row.order);
    items.push({
      id: `cancel:${row.id}`,
      category: "team",
      severity: "info",
      icon: "lock",
      title: `Order ${text(order?.order_number) || ""} was cancelled at the POS`.replace(
        "  ",
        " ",
      ),
      description: `Authorized with the manager PIN by ${text(person?.full_name) || text(person?.email) || "a cashier"}`,
      at: text(row.created_at) || null,
      href: "/void-security",
      actionLabel: "View cancellation log",
    });
  }
  for (const row of rows("newOrders", recent))
    items.push({
      id: `order:${row.id}`,
      category: "orders",
      severity: "info",
      icon: "coffee",
      title: `New ${row.order_source === "pos" ? "counter" : "app"} order ${text(row.order_number)}`,
      description: `${orderType(row.order_type)} · ${peso(row.total)}`,
      at: text(row.created_at) || null,
      href: "/orders",
      actionLabel: "View orders",
    });
  return { items, failed };
}

type ContextValue = {
  items: AdminNotification[];
  /** Items outside muted categories. */
  visible: AdminNotification[];
  unread: AdminNotification[];
  unreadCount: number;
  urgentUnread: number;
  loading: boolean;
  refreshing: boolean;
  failedSources: string[];
  lastChecked: string | null;
  /** When stock alerts were last read; null until a stock-aware page loads. */
  stockCheckedAt: string | null;
  isRead: (id: string) => boolean;
  markRead: (ids: string | string[]) => void;
  markUnread: (ids: string | string[]) => void;
  markAllRead: () => void;
  muted: NotificationCategory[];
  toggleMuted: (category: NotificationCategory) => void;
  popups: boolean;
  setPopups: (value: boolean) => void;
  refresh: () => Promise<void>;
};
const Context = createContext<ContextValue | null>(null);

export function AdminNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const ops = useOperations();
  const [remote, setRemote] = useState<AdminNotification[]>([]);
  const [stock, setStock] = useState<{
    items: AdminNotification[];
    at: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState<Source[]>([]);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    read: [],
    muted: [],
    popups: true,
  });
  const preferencesRef = useRef(preferences);
  const baseline = useRef<{
    remote: Set<string> | null;
    stock: Set<string> | null;
  }>({ remote: null, stock: null });
  const active = useRef<Promise<void> | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  // Pop up only for alerts that are new since this group was last seen; the
  // first load of each group is the baseline, so opening Admin stays quiet.
  const announce = useCallback(
    (group: "remote" | "stock", next: AdminNotification[]) => {
      const known = baseline.current[group];
      baseline.current[group] = new Set(next.map((item) => item.id));
      const current = preferencesRef.current;
      if (!known || !current.popups) return;
      const arrivals = next.filter(
        (item) =>
          !known.has(item.id) &&
          item.severity !== "info" &&
          !current.muted.includes(item.category) &&
          !current.read.includes(item.id),
      );
      if (arrivals.length === 1)
        notifyAdmin(
          arrivals[0].title,
          arrivals[0].severity === "danger" ? "error" : "warning",
          { action: { label: arrivals[0].actionLabel, href: arrivals[0].href } },
        );
      else if (arrivals.length > 1)
        notifyAdmin(
          `${arrivals.length} new alerts need attention.`,
          arrivals.some((item) => item.severity === "danger")
            ? "error"
            : "warning",
          { action: { label: "Review", href: "/notifications" } },
        );
    },
    [],
  );

  useEffect(() => {
    const cached = readStockCache();
    if (!cached) return;
    void Promise.resolve().then(() => {
      if (baseline.current.stock) return;
      baseline.current.stock = new Set(cached.items.map((item) => item.id));
      setStock(cached);
    });
  }, []);

  useEffect(() => {
    if (!ops.lastUpdated) return;
    const next = stockAlerts(ops.stock, ops.batches);
    announce("stock", next);
    writeStockCache(next, ops.lastUpdated);
    void Promise.resolve().then(() =>
      setStock({ items: next, at: ops.lastUpdated as string }),
    );
  }, [announce, ops.batches, ops.lastUpdated, ops.stock]);

  useEffect(() => {
    const stored = readPreferences(userId);
    preferencesRef.current = stored;
    void Promise.resolve().then(() => setPreferences(stored));
  }, [userId]);

  const updatePreferences = useCallback(
    (change: (current: Preferences) => Preferences) => {
      const next = change(preferencesRef.current);
      next.read = next.read.slice(-READ_LIMIT);
      preferencesRef.current = next;
      setPreferences(next);
      writePreferences(userId, next);
    },
    [userId],
  );

  const readOnce = useCallback(async () => {
    setRefreshing(true);
    try {
      const feed = await loadFeed();
      if (!mounted.current) return;
      announce("remote", feed.items);
      setRemote(feed.items);
      setFailed(feed.failed);
      setLastChecked(new Date().toISOString());
    } catch {
      if (mounted.current) setFailed(allSources);
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [announce]);

  const refresh = useCallback(() => {
    pending.current = true;
    if (active.current) return active.current;
    const work = async () => {
      do {
        pending.current = false;
        await readOnce();
      } while (pending.current && mounted.current);
    };
    active.current = work().finally(() => {
      active.current = null;
    });
    return active.current;
  }, [readOnce]);

  useEffect(() => {
    mounted.current = true;
    if (!userId) return;
    void refresh();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), REFRESH_DEBOUNCE);
    };
    let channel = supabase.channel(`jayds-admin-notifications-${userId}`);
    // Stock changes already reach Admin through the operations channel.
    for (const table of [
      "orders",
      "customer_support_cases",
      "profiles",
      "void_logs",
    ])
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        soon,
      );
    channel.subscribe();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_INTERVAL);
    const wake = () => {
      if (navigator.onLine) soon();
    };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      mounted.current = false;
      clearTimeout(debounce);
      clearInterval(poll);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const items = useMemo(
    () => sortFeed([...(stock?.items ?? []), ...remote]),
    [remote, stock],
  );

  const value = useMemo<ContextValue>(() => {
    const readSet = new Set(preferences.read);
    const visible = items.filter(
      (item) => !preferences.muted.includes(item.category),
    );
    const unread = visible.filter((item) => !readSet.has(item.id));
    return {
      items,
      visible,
      unread,
      unreadCount: unread.length,
      urgentUnread: unread.filter((item) => item.severity === "danger").length,
      loading,
      refreshing,
      failedSources: failed.map((source) => sourceLabels[source]),
      lastChecked,
      stockCheckedAt: stock?.at ?? null,
      isRead: (id) => readSet.has(id),
      markRead: (ids) =>
        updatePreferences((current) => {
          const list = Array.isArray(ids) ? ids : [ids];
          const next = new Set(current.read);
          for (const id of list) next.add(id);
          return { ...current, read: [...next] };
        }),
      markUnread: (ids) =>
        updatePreferences((current) => {
          const list = new Set(Array.isArray(ids) ? ids : [ids]);
          return {
            ...current,
            read: current.read.filter((value) => !list.has(value)),
          };
        }),
      markAllRead: () => {
        updatePreferences((current) => {
          const next = new Set(current.read);
          for (const item of visible) next.add(item.id);
          return { ...current, read: [...next] };
        });
        notifyAdmin("All caught up. Notifications marked as read.", "success");
      },
      muted: preferences.muted,
      toggleMuted: (category) =>
        updatePreferences((current) => ({
          ...current,
          muted: current.muted.includes(category)
            ? current.muted.filter((value) => value !== category)
            : [...current.muted, category],
        })),
      popups: preferences.popups,
      setPopups: (popups) =>
        updatePreferences((current) => ({ ...current, popups })),
      refresh,
    };
  }, [
    failed,
    items,
    lastChecked,
    loading,
    preferences,
    refresh,
    refreshing,
    stock,
    updatePreferences,
  ]);

  // The tab title carries the unread count, so a backgrounded tab still shows it.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    const count = value.unreadCount;
    document.title = count ? `(${count > 99 ? "99+" : count}) ${base}` : base;
  }, [value.unreadCount]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminNotifications() {
  const value = useContext(Context);
  if (!value) throw new Error("AdminNotificationsProvider missing");
  return value;
}

/**
 * For the bell panel: long runs of the same stock condition become one
 * summary row (it still marks every member read). The full page lists them all.
 */
export function condenseForPanel(items: AdminNotification[], limit = 3) {
  const groups: {
    key: string;
    match: (item: AdminNotification) => boolean;
    summary: (members: AdminNotification[]) => Omit<AdminNotification, "id" | "members">;
  }[] = [
    {
      key: "stock-out",
      match: (item) => item.id.startsWith("stock:") && item.id.endsWith(":out"),
      summary: (members) => ({
        category: "stock",
        severity: "danger",
        icon: "alert",
        title: `${members.length} ingredients are out of stock`,
        description: names(members, " is out of stock"),
        at: null,
        href: "/inventory?filter=low",
        actionLabel: "Review stock",
      }),
    },
    {
      key: "stock-low",
      match: (item) => item.id.startsWith("stock:") && item.id.endsWith(":low"),
      summary: (members) => ({
        category: "stock",
        severity: "warning",
        icon: "stock",
        title: `${members.length} ingredients are running low`,
        description: names(members, " is running low"),
        at: null,
        href: "/inventory?filter=low",
        actionLabel: "Review stock",
      }),
    },
    {
      key: "expired",
      match: (item) => item.id.startsWith("expiry:") && item.id.endsWith(":expired"),
      summary: (members) => ({
        category: "stock",
        severity: "danger",
        icon: "calendar",
        title: `${members.length} stock batches have expired`,
        description: names(members, " expired"),
        at: null,
        href: "/inventory?filter=expiry",
        actionLabel: "Check batches",
      }),
    },
    {
      key: "expiring",
      match: (item) => item.id.startsWith("expiry:") && item.id.endsWith(":soon"),
      summary: (members) => ({
        category: "stock",
        severity: "warning",
        icon: "calendar",
        title: `${members.length} batches expire within ${EXPIRY_WINDOW_DAYS} days`,
        description: names(members, /\sexpires.*$/),
        at: null,
        href: "/inventory?filter=expiry",
        actionLabel: "Check batches",
      }),
    },
  ];
  const result: AdminNotification[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const group = groups.find((candidate) => candidate.match(item));
    if (!group) {
      result.push(item);
      continue;
    }
    if (placed.has(group.key)) continue;
    const members = items.filter(group.match);
    placed.add(group.key);
    if (members.length <= limit) result.push(...members);
    else
      result.push({
        ...group.summary(members),
        id: `group:${group.key}`,
        members: members.map((member) => member.id),
      });
  }
  return result;
}
function names(members: AdminNotification[], suffix: string | RegExp) {
  const list = members.map((member) => member.title.replace(suffix, "").trim());
  const shown = list.slice(0, 3).join(", ");
  return list.length > 3 ? `${shown} and ${list.length - 3} more` : shown;
}

export function relativeTime(iso: string | null, now = Date.now()) {
  if (!iso) return "Ongoing";
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.round(diff / 60_000);
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
