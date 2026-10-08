"use client";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useOrders } from "@cafeos/shared/hooks/useOrders";
import { supabase } from "@cafeos/shared/supabase/client";
import { PosIcon } from "./PosPrimitives";
import { BrandArtwork } from "@cafeos/shared/brand";
import { StaffHelp } from "./StaffHelp";
const statuses = ["pending", "confirmed", "preparing", "ready"] as const;
export function PosShell({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const path = usePathname(),
    router = useRouter();
  const [helpPath, setHelpPath] = useState<string | null>(null);
  const { profile, user, signOut } = useAuth();
  const { orders } = useOrders({
    statuses: [...statuses],
    limit: 200,
    itemMode: "none",
    includeCustomer: false,
  });
  const [connection, setConnection] = useState("Connecting"),
    [branch, setBranch] = useState("Jayds Café · Main branch");
  useEffect(() => {
    let active = true,
      connected = false;
    const refresh = async () => {
      if (!navigator.onLine) {
        if (active) setConnection("Offline · drafting");
        return;
      }
      const { data, error } = await supabase.rpc("get_pos_status_board");
      if (!active) return;
      if (error)
        setConnection(
          error.code === "PGRST202"
            ? "Database upgrade needed"
            : "Connection interrupted",
        );
      else {
        setBranch(data.branch_name);
        setConnection(connected ? "Live" : "Polling");
      }
    };
    void refresh();
    const channel = supabase
      .channel("pos-shell-" + createUuid())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_order_state" },
        () => void refresh(),
      )
      .subscribe((status) => {
        connected = status === "SUBSCRIBED";
        void refresh();
      });
    const timer = setInterval(() => void refresh(), 30_000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[role="dialog"],[role="alertdialog"]',
        )
      )
        return;
      if (e.key === "F2") {
        e.preventDefault();
        router.push("/new-order");
      }
      if (e.key === "F3") {
        e.preventDefault();
        router.push("/dashboard");
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [router]);
  const count = orders.filter((o) => !o.is_parked).length;
  return (
    <div className="pos-shell">
      <nav className="pos-rail" aria-label="Cashier navigation">
        <Link href="/dashboard" className="pos-brand" aria-label="Jayds Café">
          <BrandArtwork
            variant="symbol"
            tone="cream"
            className="pos-brand-symbol"
          />
          <BrandArtwork
            variant="wordmark"
            tone="cream"
            className="pos-brand-wordmark"
          />
        </Link>
        <div className="pos-rail-links">
          <Link
            href="/new-order"
            aria-current={path.includes("new-order") ? "page" : undefined}
            title="Register · F2"
          >
            <PosIcon name="register" />
            <span>Register</span>
          </Link>
          <Link
            href="/dashboard"
            aria-current={path.includes("dashboard") ? "page" : undefined}
            title="Orders · F3"
          >
            <PosIcon name="orders" />
            <span>Orders</span>
            {count > 0 && <b>{count}</b>}
          </Link>
          <Link
            href="/kds"
            target="_blank"
            rel="noopener noreferrer"
            title="Open TV status board"
          >
            <PosIcon name="tv" />
            <span>TV board</span>
          </Link>
          <Link
            href="/void"
            aria-current={path.includes("void") ? "page" : undefined}
          >
            <PosIcon name="trash" />
            <span>Cancel order</span>
          </Link>
        </div>
        <button
          className="pos-rail-exit"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
          title="Sign out"
        >
          <PosIcon name="logout" />
          <span>Sign out</span>
        </button>
      </nav>
      <div className="pos-workspace">
        <header className="pos-topbar">
          <div>
            <p className="pos-eyebrow">{branch}</p>
            <h1>{title}</h1>
          </div>
          <div className="pos-topbar-right">
            <button
              className="pos-button"
              aria-label="Help with this page"
              onClick={() => setHelpPath(path)}
            >
              Help
            </button>
            <span
              className={
                "pos-connection " + (connection === "Live" ? "is-live" : "")
              }
            >
              <i />
              {connection}
            </span>
            <span className="pos-cashier">
              <PosIcon name="user" />
              {profile?.full_name || user?.email || "Cashier"}
            </span>
            {actions}
          </div>
        </header>
        <main className="pos-main">{children}</main>
      </div>
      {helpPath === path && (
        <StaffHelp path={path} onClose={() => setHelpPath(null)} />
      )}
    </div>
  );
}
