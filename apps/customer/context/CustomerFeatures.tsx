"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import type { MenuItem, SelectedVariant } from "@cafeos/shared/types";
import type { Session } from "@supabase/supabase-js";

export interface FavoriteEntry {
  menu_item_id: string;
  configuration: SelectedVariant[];
  created_at?: string;
}
export async function customerHeaders(
  expectedOwner?: string | null,
): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  if (
    expectedOwner !== undefined &&
    (data.session?.user.id ?? null) !== expectedOwner
  )
    throw new Error(
      "Your account changed. Please retry from your current account.",
    );
  return {
    "Content-Type": "application/json",
    ...(data.session
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {}),
  };
}
function favoriteHeaders(
  owner: string,
  session: Session | null,
): Record<string, string> {
  if (!session || session.user.id !== owner)
    throw new Error(
      "Your account changed. Please retry from your current account.",
    );
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}
const Favorites = createContext<{
  items: FavoriteEntry[];
  loading: boolean;
  error: string;
  isFavorite: (id: string) => boolean;
  toggle: (item: MenuItem) => Promise<void>;
  remove: (entry: FavoriteEntry) => Promise<void>;
} | null>(null);
export function CustomerFeaturesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, session, initialized } = useAuth();
  const owner = user?.id ?? "guest";
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const generation = useRef(0);
  const mutation = useRef<number | null>(null);
  const [items, setItems] = useState<FavoriteEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!initialized) return;
    const epoch = ++generation.current;
    mutation.current = null;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || epoch !== generation.current) return;
      setItems([]);
      setLoading(true);
      setError("");
      setLoadedOwner(owner);
      if (!user) {
        try {
          const data = JSON.parse(
            localStorage.getItem("jayds-guest-favorites") ?? "[]",
          );
          setItems(
            Array.isArray(data)
              ? data.filter((i) => typeof i?.menu_item_id === "string")
              : [],
          );
        } catch {
          setItems([]);
        }
        setLoading(false);
        return;
      }
      const load = async () => {
        try {
          const response = await fetch("/api/customer/favorites", {
            headers: favoriteHeaders(owner, session),
            cache: "no-store",
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Favorites could not load.");
          if (!cancelled && epoch === generation.current)
            setItems(result.items ?? []);
        } catch (e) {
          if (!cancelled && epoch === generation.current)
            setError(
              e instanceof Error ? e.message : "Favorites could not load.",
            );
        } finally {
          if (!cancelled && epoch === generation.current) setLoading(false);
        }
      };
      void load();
    });
    return () => {
      cancelled = true;
    };
  }, [owner, user, session, initialized]);
  const toggle = useCallback(
    async (item: MenuItem) => {
      if (loading || mutation.current !== null || loadedOwner !== owner) return;
      const epoch = generation.current;
      mutation.current = epoch;
      const exists = items.some((i) => i.menu_item_id === item.id),
        next = exists
          ? items.filter((i) => i.menu_item_id !== item.id)
          : [...items, { menu_item_id: item.id, configuration: [] }];
      setError("");
      try {
        if (user) {
          const response = await fetch("/api/customer/favorites", {
            method: exists ? "DELETE" : "POST",
            headers: favoriteHeaders(owner, session),
            body: JSON.stringify({ menu_item_id: item.id, configuration: [] }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Favorite could not save.");
        } else
          localStorage.setItem("jayds-guest-favorites", JSON.stringify(next));
        if (epoch === generation.current) setItems(next);
      } catch (e) {
        if (epoch === generation.current)
          setError(e instanceof Error ? e.message : "Favorite could not save.");
      } finally {
        if (mutation.current === epoch) mutation.current = null;
      }
    },
    [items, user, session, loading, loadedOwner, owner],
  );
  const remove = useCallback(
    async (entry: FavoriteEntry) => {
      if (loading || mutation.current !== null || loadedOwner !== owner) return;
      const epoch = generation.current;
      mutation.current = epoch;
      setError("");
      try {
        const next = items.filter((i) => i !== entry);
        if (user) {
          const response = await fetch("/api/customer/favorites", {
            method: "DELETE",
            headers: favoriteHeaders(owner, session),
            body: JSON.stringify({
              menu_item_id: entry.menu_item_id,
              configuration: entry.configuration ?? [],
            }),
          });
          if (!response.ok)
            throw new Error("Favorite could not be removed. Please retry.");
        } else
          localStorage.setItem("jayds-guest-favorites", JSON.stringify(next));
        if (epoch === generation.current) setItems(next);
      } catch (e) {
        if (epoch === generation.current)
          setError(
            e instanceof Error ? e.message : "Favorite could not be removed.",
          );
      } finally {
        if (mutation.current === epoch) mutation.current = null;
      }
    },
    [items, loading, loadedOwner, owner, user, session],
  );
  const visibleItems = loadedOwner === owner ? items : [];
  return (
    <Favorites.Provider
      value={{
        items: visibleItems,
        loading: loading || loadedOwner !== owner,
        error: loadedOwner === owner ? error : "",
        isFavorite: (id) => visibleItems.some((i) => i.menu_item_id === id),
        toggle,
        remove,
      }}
    >
      {children}
    </Favorites.Provider>
  );
}
export function useCustomerFavorites() {
  const value = useContext(Favorites);
  if (!value) throw new Error("Customer features provider missing");
  return value;
}
