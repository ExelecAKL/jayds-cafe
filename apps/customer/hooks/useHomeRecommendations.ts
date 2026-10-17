"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import type { MenuItem } from "@cafeos/shared/types";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { customerHeaders } from "../context/CustomerFeatures";
import {
  buildHomeRecommendations,
  emptyRecommendations,
  type RecommendationHistory,
} from "../utils/recommendations";

// Memory only: private history never enters browser storage or service-worker caches.
const recent = new Map<
  string,
  { at: number; history: RecommendationHistory }
>();
const freshFor = 30_000;
export function useHomeRecommendations(catalog: MenuItem[]) {
  const { user, initialized } = useAuth();
  const owner = user?.id ?? null;
  const epoch = useRef(0),
    controller = useRef<AbortController | null>(null),
    activeRead = useRef<Promise<RecommendationHistory | null> | null>(null);
  const [state, setState] = useState<{
    owner: string | null;
    history: RecommendationHistory | null;
    loading: boolean;
    error: string;
  }>(() => ({
    owner,
    history: owner ? (recent.get(owner)?.history ?? null) : null,
    loading: !!owner,
    error: "",
  }));
  const read = useCallback(
    (force = true): Promise<RecommendationHistory | null> => {
      if (!initialized || !owner) return Promise.resolve(null);
      if (!navigator.onLine) {
        ++epoch.current;
        controller.current?.abort();
        activeRead.current = null;
        recent.delete(owner);
        setState({
          owner,
          history: null,
          loading: false,
          error: "Connect to load your personal picks.",
        });
        return Promise.resolve(null);
      }
      const saved = recent.get(owner);
      if (!force && saved && Date.now() - saved.at < freshFor) {
        setState({ owner, history: saved.history, loading: false, error: "" });
        return Promise.resolve(saved.history);
      }
      if (activeRead.current) return activeRead.current;
      const version = epoch.current;
      const abort = new AbortController();
      controller.current = abort;
      const timer = setTimeout(() => abort.abort(), 12_000);
      setState((previous) => ({
        owner,
        history: previous.owner === owner ? previous.history : null,
        loading: true,
        error: "",
      }));
      const work = async () => {
        try {
          const headers = await customerHeaders(owner);
          if (epoch.current !== version) return null;
          const response = await fetch(
            "/api/customer/recommendations?history=1",
            { headers, cache: "no-store", signal: abort.signal },
          );
          const history = await response.json();
          await customerHeaders(owner);
          if (epoch.current !== version) return null;
          if (
            !response.ok ||
            typeof history.hasOrderHistory !== "boolean" ||
            !Array.isArray(history.products)
          )
            throw Error(
              history.error ||
                "Your previous orders could not load. Please retry.",
            );
          recent.set(owner, { at: Date.now(), history });
          if (recent.size > 3) recent.delete(recent.keys().next().value!);
          setState({ owner, history, loading: false, error: "" });
          return history as RecommendationHistory;
        } catch (error) {
          if (epoch.current === version) {
            recent.delete(owner);
            setState({
              owner,
              history: null,
              loading: false,
              error:
                error instanceof Error && error.name !== "AbortError"
                  ? error.message
                  : "Your previous orders could not load. Please retry.",
            });
          }
          return null;
        } finally {
          clearTimeout(timer);
          if (epoch.current === version) activeRead.current = null;
        }
      };
      const pending = work();
      activeRead.current = pending;
      return pending;
    },
    [owner, initialized],
  );
  const refresh = useCallback(async () => {
    if (!initialized || !owner || !navigator.onLine) return null;
    // A deliberate reorder still verifies today's complete price/options. This
    // expensive read is excluded from initial display and return navigation.
    const [history, menu] = await Promise.all([
      read(true),
      supabase
        .rpc("get_published_catalog")
        .abortSignal(AbortSignal.timeout(12000)),
    ]);
    return history && !menu.error && Array.isArray(menu.data?.menuItems)
      ? buildHomeRecommendations(history, menu.data.menuItems)
      : null;
  }, [read, initialized, owner]);
  useEffect(() => {
    if (!initialized || !owner) return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) void read(false);
    });
    const background = () => {
      if (!document.hidden) void read(true);
    };
    const changed = () => void read(true);
    window.addEventListener("focus", background);
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    document.addEventListener("visibilitychange", background);
    const channel = supabase
      .channel(`home-recommendations-${createUuid()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${owner}`,
        },
        changed,
      )
      .subscribe();
    return () => {
      alive = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Monotonic request generation, not a DOM ref.
      ++epoch.current;
      controller.current?.abort();
      activeRead.current = null;
      window.removeEventListener("focus", background);
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
      document.removeEventListener("visibilitychange", background);
      void supabase.removeChannel(channel);
    };
  }, [owner, initialized, read]);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") recent.clear();
    });
    return () => subscription.unsubscribe();
  }, []);
  const visible = initialized && !!owner && state.owner === owner;
  const data = useMemo(
    () =>
      visible && state.history
        ? buildHomeRecommendations(state.history, catalog)
        : emptyRecommendations,
    [visible, state.history, catalog],
  );
  return {
    data,
    loading: visible && state.loading,
    error: visible ? state.error : "",
    refresh,
  };
}
