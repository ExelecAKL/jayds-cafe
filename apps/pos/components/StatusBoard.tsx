"use client";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type { StatusBoard as Board } from "@cafeos/shared/pos/types";
import { PosIcon } from "./PosPrimitives";
export function StatusBoard() {
  const [board, setBoard] = useState<Board>({
      branch_name: "Jayds Café",
      version: 0,
      orders: [],
    }),
    [connection, setConnection] = useState("Connecting"),
    [rotation, setRotation] = useState(0),
    [voice, setVoice] = useState(false),
    [error, setError] = useState("");
  const seen = useRef<Set<string> | null>(null),
    announce = useRef(false);
  useEffect(() => {
    announce.current = voice;
  }, [voice]);
  useEffect(() => {
    let active = true,
      connected = false;
    const refresh = async () => {
      if (!navigator.onLine) {
        if (active) setConnection("Offline");
        return;
      }
      const { data, error } = await supabase.rpc("get_pos_status_board");
      if (!active) return;
      if (error) {
        setConnection("Disconnected");
        setError(
          error.code === "PGRST202"
            ? "Status is unavailable. Please ask the counter about your order."
            : "Connection interrupted. Showing the last confirmed status.",
        );
        return;
      }
      const next = data as Board,
        ready = new Set(
          next.orders
            .filter((o) => o.status === "ready")
            .map((o) => o.order_number),
        );
      if (seen.current && announce.current && "speechSynthesis" in window)
        for (const number of ready)
          if (!seen.current.has(number)) {
            const speech = new SpeechSynthesisUtterance(
              "Order " + number + ". Your order is ready.",
            );
            speech.lang = "en-PH";
            speech.rate = 0.9;
            window.speechSynthesis.speak(speech);
          }
      seen.current = ready;
      setBoard(next);
      setError("");
      setConnection(connected ? "Live" : "Polling");
    };
    void refresh();
    const channel = supabase
      .channel("jayds-tv-" + createUuid())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos_order_state" },
        () => void refresh(),
      )
      .subscribe((status) => {
        connected = status === "SUBSCRIBED";
        void refresh();
      });
    const polling = setInterval(() => void refresh(), 30_000),
      rotate = setInterval(() => setRotation((n) => n + 1), 8000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(polling);
      clearInterval(rotate);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, []);
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError(
        "Fullscreen is unavailable. Use the browser’s fullscreen control.",
      );
    }
  };
  return (
    <main className="tv-board">
      <header className="tv-header">
        <div>
          <p className="pos-eyebrow">{board.branch_name}</p>
          <h1 className="tv-brand">A little wait. A lovely cup.</h1>
        </div>
        <div className="tv-header-controls">
          <span
            className={
              "pos-connection " + (connection === "Live" ? "is-live" : "")
            }
          >
            <i />
            {connection}
          </span>
          <button
            className="pos-button"
            aria-pressed={voice}
            onClick={() => setVoice((v) => !v)}
          >
            <PosIcon name="volume" />
            Voice {voice ? "on" : "off"}
          </button>
          <button
            className="pos-icon-button"
            aria-label="Toggle fullscreen"
            onClick={() => void fullscreen()}
          >
            <PosIcon name="fullscreen" />
          </button>
        </div>
      </header>
      <div className="tv-columns">
        {(["preparing", "ready"] as const).map((status) => {
          const orders = board.orders.filter((o) => o.status === status),
            pages = Math.max(1, Math.ceil(orders.length / 6)),
            page = rotation % pages;
          return (
            <section
              className={"tv-column " + (status === "ready" ? "tv-ready" : "")}
              key={status}
            >
              <h2 className="tv-column-header">
                {status === "ready" ? "Ready to collect" : "Preparing"}{" "}
                <small style={{ fontSize: 15, opacity: 0.7 }}>
                  · {orders.length}
                </small>
              </h2>
              <div className="tv-numbers">
                {orders.slice(page * 6, page * 6 + 6).map((o) => (
                  <p className="tv-order-number" key={o.order_number}>
                    {o.order_number}
                  </p>
                ))}
                {!orders.length && (
                  <p className="pos-muted" style={{ gridColumn: "1 / -1" }}>
                    {" "}
                    {status === "ready"
                      ? "Your order number will appear here."
                      : "Freshly made, just for you."}
                  </p>
                )}
              </div>
              {pages > 1 && (
                <p
                  className="pos-muted"
                  style={{ textAlign: "center", paddingBottom: 14 }}
                >
                  {" "}
                  {page + 1} / {pages} · More orders rotate automatically
                </p>
              )}
            </section>
          );
        })}
      </div>
      <footer className="tv-footer">
        {error ||
          "Please collect your order at the counter when your number is ready."}
      </footer>
    </main>
  );
}
