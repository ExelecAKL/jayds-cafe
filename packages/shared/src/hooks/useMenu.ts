// packages/shared/src/hooks/useMenu.ts
// useMenu() - Fetch categories and menu items with filtering

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../supabase/client";
import type { Category, MenuItem } from "../types/index";

interface UseMenuOptions {
  includeUnavailable?: boolean;
  cacheTtlMs?: number;
}

interface UseMenuReturn {
  categories: Category[];
  menuItems: MenuItem[];
  featuredItems: MenuItem[];
  loading: boolean;
  error: string | null;
  filterByCategory: (categoryId: string | null) => void;
  selectedCategoryId: string | null;
  filteredItems: MenuItem[];
  refetch: () => Promise<void>;
}

interface MenuCacheEntry {
  categories: Category[];
  menuItems: MenuItem[];
  fetchedAt: number;
}

const DEFAULT_MENU_CACHE_TTL_MS = 30_000;
const CATEGORY_SELECT =
  "id, name, description, sort_order, is_active, status, created_at, updated_at";
const MENU_ITEM_SELECT = `
  id,
  category_id,
  name,
  description,
  price,
  image_url,
  is_available,
  is_featured,
  status,
  prep_time_minutes,
  sort_order,
  tags,
  created_at,
  updated_at,
  category:categories(
    id,
    name,
    description,
    sort_order,
    is_active,
    created_at,
    updated_at
  ),
  variants:item_variants(
    id,
    menu_item_id,
    variant_group,
    label,
    price_modifier,
    is_default,
    sort_order,
    applicable_items,
    created_at
  )
`;

const menuCache = new Map<string, MenuCacheEntry>();
const menuRequests = new Map<string, Promise<MenuCacheEntry>>();
const menuRequestVersions = new Map<string, number>();
let menuSubscriptionId = 0;

function getMenuCacheKey(includeUnavailable: boolean) {
  return includeUnavailable ? "all" : "available";
}

async function fetchMenuData(
  includeUnavailable: boolean,
): Promise<MenuCacheEntry> {
  if (!includeUnavailable) {
    const { data, error } = await supabase.rpc("get_published_catalog");
    if (!error && data)
      return {
        categories: data.categories ?? [],
        menuItems: data.menuItems ?? [],
        fetchedAt: Date.now(),
      };
    if (error && error.code !== "PGRST202") throw new Error(error.message);
  }
  let categoriesQuery = supabase
    .from("categories")
    .select(CATEGORY_SELECT)
    .order("sort_order", { ascending: true });
  let itemsQuery = supabase
    .from("menu_items")
    .select(MENU_ITEM_SELECT)
    .order("sort_order", { ascending: true });
  if (!includeUnavailable) {
    categoriesQuery = categoriesQuery
      .eq("is_active", true)
      .eq("status", "active");
    itemsQuery = itemsQuery.eq("status", "active");
  }

  const [
    { data: categoriesData, error: categoriesError },
    { data: itemsData, error: itemsError },
    published,
  ] = await Promise.all([
    categoriesQuery,
    itemsQuery,
    includeUnavailable
      ? supabase.rpc("get_published_catalog")
      : Promise.resolve(null),
  ]);

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  if (itemsError) {
    throw new Error(itemsError.message);
  }
  if (published?.error && published.error.code !== "PGRST202")
    throw new Error(published.error.message);
  const availability = published?.data
    ? new Map<string, MenuItem>(
        (published.data.menuItems ?? []).map((item: MenuItem) => [
          item.id,
          item,
        ]),
      )
    : null;

  return {
    categories: (categoriesData as Category[]) || [],
    menuItems: ((itemsData as unknown as MenuItem[]) || [])
      .filter(
        (m) =>
          includeUnavailable ||
          !m.category_id ||
          (categoriesData ?? []).some((c) => c.id === m.category_id),
      )
      .map((item) =>
        availability
          ? {
              ...item,
              manually_available: item.is_available,
              is_available: availability.get(item.id)?.is_available ?? false,
              availability_reason:
                availability.get(item.id)?.availability_reason ??
                "Outside ordering catalog",
            }
          : item,
      ),
    fetchedAt: Date.now(),
  };
}

/**
 * Fetches active categories and menu items.
 * Provides filtering by category and featured items.
 */
export function useMenu(options: UseMenuOptions = {}): UseMenuReturn {
  const { includeUnavailable = false, cacheTtlMs = DEFAULT_MENU_CACHE_TTL_MS } =
    options;
  const cacheKey = getMenuCacheKey(includeUnavailable);
  const cachedMenu = menuCache.get(cacheKey);
  const localRequestVersion = useRef(0);
  const hasLoaded = useRef(Boolean(cachedMenu));
  const [categories, setCategories] = useState<Category[]>(
    () => cachedMenu?.categories ?? [],
  );
  const [menuItems, setMenuItems] = useState<MenuItem[]>(
    () => cachedMenu?.menuItems ?? [],
  );
  const [loading, setLoading] = useState(!cachedMenu);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  const fetchMenu = useCallback(
    async (force = false) => {
      const localVersion = ++localRequestVersion.current;
      try {
        const cacheEntry = menuCache.get(cacheKey);
        if (
          !includeUnavailable &&
          !hasLoaded.current &&
          typeof window !== "undefined"
        ) {
          try {
            const stored = JSON.parse(
              localStorage.getItem("jayds-published-catalog") ?? "null",
            ) as MenuCacheEntry | null;
            if (
              stored &&
              Array.isArray(stored.categories) &&
              Array.isArray(stored.menuItems)
            ) {
              setCategories(stored.categories);
              setMenuItems(stored.menuItems);
              hasLoaded.current = true;
              setLoading(false);
            }
          } catch {
            /* Browsing also works when storage is unavailable. */
          }
        }
        const isCacheFresh =
          cacheEntry && Date.now() - cacheEntry.fetchedAt < cacheTtlMs;

        if (!force && isCacheFresh) {
          setCategories(cacheEntry.categories);
          setMenuItems(cacheEntry.menuItems);
          setError(null);
          hasLoaded.current = true;
          setLoading(false);
          return;
        }

        if (!hasLoaded.current) setLoading(true);

        let request = menuRequests.get(cacheKey);

        if (!request || force) {
          request = fetchMenuData(includeUnavailable);
          menuRequests.set(cacheKey, request);
          menuRequestVersions.set(
            cacheKey,
            (menuRequestVersions.get(cacheKey) ?? 0) + 1,
          );
        }
        const requestVersion = menuRequestVersions.get(cacheKey);

        let nextMenu: MenuCacheEntry;
        try {
          nextMenu = await request;
          if (localRequestVersion.current !== localVersion) return;
          // Keep the shared cache current without starving other mounted hooks.
          if (menuRequestVersions.get(cacheKey) === requestVersion) {
            menuCache.set(cacheKey, nextMenu);
            if (!includeUnavailable) {
              try {
                localStorage.setItem(
                  "jayds-published-catalog",
                  JSON.stringify(nextMenu),
                );
              } catch {
                /* Storage is optional. */
              }
            }
          }
        } finally {
          if (menuRequests.get(cacheKey) === request) {
            menuRequests.delete(cacheKey);
          }
        }
        setCategories(nextMenu.categories);
        setMenuItems(nextMenu.menuItems);
        hasLoaded.current = true;
        setError(null);
      } catch (err) {
        if (localRequestVersion.current === localVersion) {
          setError(err instanceof Error ? err.message : "Failed to fetch menu");
        }
      } finally {
        if (localRequestVersion.current === localVersion) setLoading(false);
      }
    },
    [cacheKey, cacheTtlMs, includeUnavailable],
  );

  useEffect(() => {
    void Promise.resolve().then(() => fetchMenu());

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      menuCache.clear();
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void fetchMenu(true), 150);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const channel = supabase.channel(`menu-${++menuSubscriptionId}`);
    for (const table of [
      "menu_items",
      "categories",
      "item_variants",
      "catalog_state",
    ]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refresh,
      );
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") refresh();
    });
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    // Recover missed events after a connection interruption or while the
    // database publication migration is still pending.
    const poll = setInterval(refreshWhenVisible, Math.max(cacheTtlMs, 15_000));

    return () => {
      clearTimeout(refreshTimer);
      clearInterval(poll);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [cacheTtlMs, fetchMenu]);

  const filterByCategory = useCallback((categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
  }, []);

  const filteredItems = useMemo(
    () =>
      selectedCategoryId
        ? menuItems.filter((item) => item.category_id === selectedCategoryId)
        : menuItems,
    [menuItems, selectedCategoryId],
  );

  const featuredItems = useMemo(
    () => menuItems.filter((item) => item.is_featured),
    [menuItems],
  );

  return {
    categories,
    menuItems,
    featuredItems,
    loading,
    error,
    filterByCategory,
    selectedCategoryId,
    filteredItems,
    refetch: () => fetchMenu(true),
  };
}
