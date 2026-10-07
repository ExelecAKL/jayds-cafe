"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import AppShell, {
  EmptyState,
  InlineNotice,
} from "../../../../components/AppShell";
import MenuCard from "../../../../components/MenuCard";
import Icon from "../../../../components/Icon";
import { useCustomerFavorites } from "../../../../context/CustomerFeatures";
import FulfillmentContext from "../../../../components/FulfillmentContext";
import { categoryIcon } from "../../../../utils/menuArtwork";
export default function BrowseMenuPage() {
  const {
    categories,
    menuItems,
    filteredItems,
    filterByCategory,
    selectedCategoryId,
    loading,
    error,
    refetch,
  } = useMenu();
  const [query, setQuery] = useState("");
  const restored = useRef(false);
  useEffect(() => {
    if (loading || restored.current) return;
    let active = true;
    queueMicrotask(() => {
      if (!active || restored.current) return;
      restored.current = true;
      try {
        const saved = JSON.parse(
          sessionStorage.getItem("jayds-menu-view") || "null",
        );
        if (saved && categories.some((c) => c.id === saved.category))
          filterByCategory(saved.category);
        if (typeof saved?.query === "string")
          setQuery(saved.query.slice(0, 120));
      } catch {
        /* Storage is optional; browsing remains available. */
      }
    });
    return () => {
      active = false;
    };
  }, [loading, categories, filterByCategory]);
  function remember(category: string | null, search: string) {
    try {
      sessionStorage.setItem(
        "jayds-menu-view",
        JSON.stringify({ category, query: search }),
      );
    } catch {}
  }
  function selectCategory(category: string | null) {
    filterByCategory(category);
    setQuery("");
    remember(category, "");
  }
  const favorites = useCustomerFavorites();
  const displayItems = useMemo(
    () =>
      (query.trim() ? menuItems : filteredItems).filter((item) =>
        `${item.name} ${item.description ?? ""} ${(item.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [filteredItems, menuItems, query],
  );
  return (
    <AppShell
      title="Find your next favorite."
      mobileTitle="Menu"
      eyebrow="The Jayds menu"
      className="menu-browser"
      cart
      actions={
        <Link
          href="/favorites"
          className="icon-button"
          aria-label="Your favorites"
        >
          <Icon name="heart" />
        </Link>
      }
    >
      <FulfillmentContext />
      <div className="menu-search mb-6">
        <label className="search-box">
          <Icon name="search" size={21} />
          <span className="sr-only">Search the menu</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              remember(selectedCategoryId, e.target.value);
            }}
            placeholder="Coffee, food, or a little treat…"
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setQuery("");
                remember(selectedCategoryId, "");
              }}
              aria-label="Clear search"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </label>
      </div>
      <div className="browse-layout">
        <nav
          aria-label="Menu categories"
          className="category-list menu-category-rail"
        >
          <button
            type="button"
            className={`chip ${!selectedCategoryId ? "chip-active" : ""}`}
            aria-pressed={!selectedCategoryId}
            onClick={() => selectCategory(null)}
          >
            <Icon name="grid" size={23} className="category-icon" />
            <span>All</span>
          </button>
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={`chip ${selectedCategoryId === category.id ? "chip-active" : ""}`}
              aria-pressed={selectedCategoryId === category.id}
              onClick={() => selectCategory(category.id)}
            >
              <Icon
                name={categoryIcon(category.name)}
                size={23}
                className="category-icon"
              />
              <span>{category.name}</span>
            </button>
          ))}
        </nav>
        <section className="browse-results" aria-label="Menu products">
          {error && (
            <InlineNotice>
              Menu updates are unavailable. Saved prices and availability need
              confirmation at checkout.
              <button className="text-link ml-2" onClick={() => void refetch()}>
                Retry
              </button>
            </InlineNotice>
          )}
          {favorites.error && (
            <InlineNotice tone="error">{favorites.error}</InlineNotice>
          )}
          <div className="section-heading">
            <h2 className="section-title">
              {query
                ? "Search results"
                : categories.find((c) => c.id === selectedCategoryId)?.name ||
                  "All good things"}
            </h2>
            <span className="text-xs text-text-secondary">
              {displayItems.length} product
              {displayItems.length === 1 ? "" : "s"}
            </span>
          </div>
          {loading ? (
            <div className="product-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div className="skeleton h-72 rounded-3xl" key={i} />
              ))}
            </div>
          ) : displayItems.length ? (
            <div className="product-grid">
              {displayItems.map((item) => (
                <MenuCard item={item} key={item.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="search"
              title={
                menuItems.length
                  ? "Nothing here just yet."
                  : "The menu is loading."
              }
              description={
                menuItems.length
                  ? "Try another name or category to find your favorite."
                  : "Reconnect and retry to see the café’s published products."
              }
              action={
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    selectCategory(null);
                    if (!menuItems.length) void refetch();
                  }}
                >
                  Reset & retry
                </button>
              }
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}
