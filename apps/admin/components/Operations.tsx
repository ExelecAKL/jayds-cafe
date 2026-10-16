"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import type { PostgrestError } from "@supabase/supabase-js";
import type {
  StockItem,
  StockBatch,
  StockMovement,
  Supplier,
  PurchaseOrder,
  GoodsReceipt,
  Stocktake,
  DemandForecast,
  InventorySettings,
  InventoryReadiness,
} from "@cafeos/shared/inventory/types";

export type IconName =
  | "overview"
  | "orders"
  | "catalog"
  | "stock"
  | "purchase"
  | "reports"
  | "people"
  | "shield"
  | "coffee"
  | "arrow"
  | "search"
  | "close"
  | "menu"
  | "bell"
  | "refresh"
  | "plus"
  | "check"
  | "logout"
  | "support"
  | "tag"
  | "ticket"
  | "receipt"
  | "userCheck"
  | "star"
  | "clock"
  | "lock"
  | "history";
const paths: Record<IconName, string> = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  orders: "M8 3h8v3H8zM6 5H4v16h16V5h-2M8 11h8M8 15h5",
  catalog: "M4 4h16v16H4zM4 10h16M10 10v10",
  stock: "m3 7 9-4 9 4v10l-9 4-9-4V7zm0 0 9 4 9-4M12 11v10",
  purchase: "M3 3h2l3 13h11l2-9H6M9 21h.01M18 21h.01",
  reports: "M4 20V4M4 20h16M8 16v-5M13 16V7M18 16v-8",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zm-4 9 3 3 5-6",
  coffee:
    "M3 8h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zm13 0h2a3 3 0 0 1 0 6h-2M6 3v2M10 2v3M14 3v2",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  close: "m6 6 12 12M18 6 6 18",
  menu: "M4 6h16M4 12h16M4 18h16",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 4L19 6",
  logout: "M9 4H4v16h5M9 12h12m-4-4 4 4-4 4",
  support: "M4 13V9a8 8 0 0 1 16 0v4M4 10H2v7h4v-7H4m16 0h2v7h-4v-7h2m0 7v4h-8",
  tag: "m3 3 9 0 9 9-9 9-9-9V3zm5 5h.01",
  ticket: "M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5zm12 0v3m0 3v2m0 3v3",
  receipt: "M5 3h14v18l-3-2-4 2-4-2-3 2V3zm3 5h8m-8 4h8m-8 4h4",
  userCheck:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m3 3 2 2 4-4",
  star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  lock: "M5 10h14v11H5V10zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2",
  history: "M3 3v6h6M3 9a10 10 0 1 1 0 6m9-8v6l4 2",
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0,
  );
export const quantity = (value: number) =>
  new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(
    Number(value) || 0,
  );
export const businessDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
export type OperationalStock = StockItem & {
  stock_value: number;
  expiring_stock: number;
};
interface State {
  stock: OperationalStock[];
  batches: StockBatch[];
  movements: StockMovement[];
  suppliers: Supplier[];
  purchases: PurchaseOrder[];
  receipts: GoodsReceipt[];
  counts: Stocktake[];
  forecasts: DemandForecast[];
  settings: InventorySettings | null;
  readiness: InventoryReadiness | null;
  loading: boolean;
  error: string;
  lastUpdated: string | null;
  connected: boolean;
  refresh: () => Promise<void>;
  run: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
}
const Context = createContext<State | null>(null);
// Use explicit pages so a growing lot/purchasing history cannot hit the API's row cap.
async function allOperationRows<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
) {
  const data: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await read(from, from + 499);
    if (result.error) return { data: null, error: result.error };
    data.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return { data, error: null };
  }
}
export function OperationsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<State, "refresh" | "run">>({
    stock: [],
    batches: [],
    movements: [],
    suppliers: [],
    purchases: [],
    receipts: [],
    counts: [],
    forecasts: [],
    settings: null,
    readiness: null,
    loading: true,
    error: "",
    lastUpdated: null,
    connected: false,
  });
  const mounted = useRef(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const results = await withRequestDeadline((signal) =>
        Promise.all([
          supabase
            .from("stock_overview")
            .select("*")
            .order("name")
            .abortSignal(signal),
          allOperationRows((from, to) =>
            supabase
              .from("stock_batches")
              .select("*")
              .gt("quantity", 0)
              .order("expires_on", { nullsFirst: false })
              .order("id")
              .range(from, to)
              .abortSignal(signal),
          ),
          supabase
            .from("stock_movements")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(150)
            .abortSignal(signal),
          supabase
            .from("suppliers")
            .select("*")
            .order("name")
            .abortSignal(signal),
          supabase.rpc("admin_purchase_orders").abortSignal(signal),
          supabase
            .from("goods_receipts")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100)
            .abortSignal(signal),
          supabase
            .from("stocktakes")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(150)
            .abortSignal(signal),
          supabase.from("forecast_overview").select("*").abortSignal(signal),
          supabase
            .from("inventory_settings")
            .select("*")
            .abortSignal(signal)
            .single(),
          supabase.rpc("get_inventory_readiness").abortSignal(signal),
        ]),
      );
      const failure = results.find((result) => result.error)?.error;
      if (failure)
        throw new Error(
          ["42P01", "PGRST205", "PGRST202"].includes(failure.code)
            ? "Apply the Jayds inventory migrations to enable the operations workspace. Existing catalog and order screens remain available."
            : failure.message,
        );
      if (!mounted.current || request !== generation.current) return;
      setState((previous) => ({
        ...previous,
        stock: results[0].data as OperationalStock[],
        batches: results[1].data as StockBatch[],
        movements: results[2].data as StockMovement[],
        suppliers: results[3].data as Supplier[],
        purchases: (results[4].data as PurchaseOrder[]).map((p) => ({
          ...p,
          lines: (p.lines ?? []).map((line) => ({
            ...line,
            ingredient: (results[0].data as OperationalStock[]).find(
              (stock) => stock.id === line.ingredient_id,
            ),
          })),
        })),
        receipts: results[5].data as GoodsReceipt[],
        counts: results[6].data as Stocktake[],
        forecasts: results[7].data as DemandForecast[],
        settings: results[8].data as InventorySettings,
        readiness: results[9].data as InventoryReadiness,
        loading: false,
        error: "",
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      if (mounted.current && request === generation.current)
        setState((previous) => ({
          ...previous,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not load operations",
        }));
    }
  }, []);
  const run = useCallback(
    async (name: string, args: Record<string, unknown> = {}) => {
      const { data, error } = await supabase.rpc(name, args);
      if (error)
        throw new Error(
          error.code === "PGRST202"
            ? "The inventory database upgrade is required for this action."
            : error.message,
        );
      await refresh();
      return data;
    },
    [refresh],
  );
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const channel = supabase
      .channel("jayds-operations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "catalog_state" },
        () => void refresh(),
      )
      .subscribe((status) =>
        setState((previous) => ({
          ...previous,
          connected: status === "SUBSCRIBED" && navigator.onLine,
        })),
      );
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    const online = () => {
      setState((previous) => ({ ...previous, connected: navigator.onLine }));
      if (navigator.onLine) void refresh();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("focus", online);
    return () => {
      mounted.current = false;
      clearInterval(poll);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("focus", online);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ ...state, refresh, run }}>
      {children}
    </Context.Provider>
  );
}
export function useOperations() {
  const value = useContext(Context);
  if (!value) throw new Error("OperationsProvider missing");
  return value;
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="ops-page-header">
      <div>
        <p className="ops-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="ops-description">{description}</p>
      </div>
      <div className="ops-header-actions">{children}</div>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "brand";
}) {
  return <span className={`ops-badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  description,
  children,
  icon = "stock",
}: {
  title: string;
  description: string;
  children?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="ops-empty">
      <Icon name={icon} size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function LoadingRows({
  label,
  rows = 5,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-label={label} className="ops-loading-rows">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="ops-loading-row" key={index} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
export function Feedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <div role="alert" className="ops-feedback error">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="ops-feedback success">
          {success}
        </div>
      )}
    </>
  );
}
export function Drawer({
  title,
  description,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  const busyRef = useRef(busy);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const requestClose = useCallback(() => {
    if (busyRef.current || closeTimer.current) return;
    setClosing(true);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    closeTimer.current = setTimeout(() => close.current(), reduced ? 0 : 220);
  }, []);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      );
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (event.key === "Escape" && !busyRef.current) requestClose();
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ) ?? [],
      ).filter((node) => node.getClientRects().length);
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (
        document.activeElement === ref.current ||
        !ref.current?.contains(document.activeElement)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [requestClose]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  return (
    <div
      className={`ops-overlay${closing ? " closing" : ""}`}
      onClick={requestClose}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`ops-drawer ${wide ? "wide" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="ops-eyebrow">Jayds back office</p>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="ops-icon-button"
            aria-label="Close dialog"
            onClick={requestClose}
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="ops-drawer-body">{children}</div>
      </section>
    </div>
  );
}
