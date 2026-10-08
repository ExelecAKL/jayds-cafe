"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { customerHeaders } from "../context/CustomerFeatures";
import {
  emptyRecommendations,
  type HomeRecommendations,
} from "../utils/recommendations";

export function useHomeRecommendations(catalogKey: string) {
  const { user, initialized } = useAuth();
  const owner = user?.id ?? null;
  const request = useRef(0),
    controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    owner: string | null;
    data: HomeRecommendations;
    loading: boolean;
    error: string;
  }>({
    owner: null,
    data: emptyRecommendations,
    loading: false,
    error: "",
  });
  const refresh = useCallback(async () => {
    const epoch = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    if (!initialized || !owner) return null;
    if (!navigator.onLine) {
      setState({
        owner,
        data: emptyRecommendations,
        loading: false,
        error: "Connect to load your personal picks.",
      });
      return null;
    }
    setState((previous) => ({
      owner,
      data: previous.owner === owner ? previous.data : emptyRecommendations,
      loading: true,
      error: "",
    }));
    try {
      const headers = await customerHeaders(owner);
      if (epoch !== request.current) return null;
      const response = await fetch("/api/customer/recommendations", {
        headers,
        cache: "no-store",
        signal: controller.current.signal,
      });
      const data = await response.json();
      await customerHeaders(owner);
      if (epoch !== request.current) return null;
      if (!response.ok)
        throw new Error(
          data.error || "Your suggestions could not load. Please retry.",
        );
      if (
        typeof data.hasOrderHistory !== "boolean" ||
        !Array.isArray(data.orderAgain) ||
        !Array.isArray(data.suggestions)
      )
        throw new Error("Your suggestions could not load. Please retry.");
      setState({ owner, data, loading: false, error: "" });
      return data as HomeRecommendations;
    } catch (error) {
      if (epoch === request.current)
        setState({
          owner,
          data: emptyRecommendations,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Your suggestions could not load. Please retry.",
        });
      return null;
    }
  }, [owner, initialized]);
  useEffect(() => {
    if (!initialized || !owner) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void refresh();
    });
    const update = () => {
      void refresh();
    };
    const visible = () => {
      if (!document.hidden) update();
    };
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    document.addEventListener("visibilitychange", visible);
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
        update,
      )
      .subscribe();
    return () => {
      active = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate pending responses at cleanup; this is a counter, not a DOM ref.
      ++request.current;
      controller.current?.abort();
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      document.removeEventListener("visibilitychange", visible);
      void supabase.removeChannel(channel);
    };
  }, [owner, initialized, catalogKey, refresh]);
  const visible = initialized && !!owner && state.owner === owner;
  return {
    data: visible ? state.data : emptyRecommendations,
    loading: visible && state.loading,
    error: visible ? state.error : "",
    refresh,
  };
}
