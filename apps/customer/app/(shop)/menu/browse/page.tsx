"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import AppShell, {
  EmptyState,
  InlineNotice,
} from "../../../../components/AppShell";
import MenuCard from "../../../../components/MenuCard";
import Icon from "../../../../components/Icon";
import FulfillmentContext from "../../../../components/FulfillmentContext";
import { categoryIcon } from "../../../../utils/menuArtwork";
import {
  CategoryRailSkeleton,
  MenuSectionsSkeleton,
} from "../../../../components/Skeletons";
export default function BrowseMenuPage() {
  const { categories, menuItems, loading, error, refetch } = useMenu();
  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [jump, setJump] = useState<{
    id: string;
    offset: number;
    behavior: ScrollBehavior;
  } | null>(null);
  const rail = useRef<HTMLElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  const restored = useRef(false);
  const leaving = useRef(false);
  const displayItems = useMemo(
    () =>
      menuItems.filter(
        (item) =>
          (!availableOnly || item.is_available) &&
          (!featuredOnly || item.is_featured) &&
          `${item.name} ${item.description ?? ""} ${item.category?.name ?? categories.find((category) => category.id === item.category_id)?.name ?? ""} ${(item.tags ?? []).join(" ")}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [menuItems, categories, query, availableOnly, featuredOnly],
  );
  const groups = useMemo(() => {
    const knownCategories = new Set(categories.map((category) => category.id));
    const grouped = categories.flatMap((category) => {
      const items = displayItems.filter(
        (item) => item.category_id === category.id,
      );
      return items.length
        ? [{ id: category.id, name: category.name, items }]
        : [];
    });
    const otherItems = displayItems.filter(
      (item) => !item.category_id || !knownCategories.has(item.category_id),
    );
    if (otherItems.length)
      grouped.push({
        id: "other-favorites",
        name: "More favorites",
        items: otherItems,
      });
    return grouped;
  }, [categories, displayItems]);
  const selectedCategoryId = groups.some(
    (group) => group.id === activeCategoryId,
  )
    ? activeCategoryId
    : groups[0]?.id;
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
        if (typeof saved?.query === "string")
          setQuery(saved.query.slice(0, 120));
        setAvailableOnly(saved?.availableOnly === true);
        setFeaturedOnly(saved?.featuredOnly === true);
        if (typeof saved?.category === "string")
          setJump({
            id: saved.category,
            offset:
              Number.isFinite(saved.offset) && saved.offset >= 0
                ? saved.offset
                : 0,
            behavior: "instant",
          });
      } catch {
        /* Storage is optional; browsing remains available. */
      }
    });
    return () => {
      active = false;
      restored.current = false;
      leaving.current = false;
    };
  }, [loading]);
  const remember = useCallback(
    function remember(
      category: string | null,
      search: string,
      offset = 0,
      filters = { availableOnly, featuredOnly },
    ) {
      try {
        sessionStorage.setItem(
          "jayds-menu-view",
          JSON.stringify({ category, query: search, offset, ...filters }),
        );
      } catch {}
    },
    [availableOnly, featuredOnly],
  );
  function scrollOffset() {
    const nav = rail.current;
    return nav && getComputedStyle(nav).flexDirection === "row"
      ? nav.getBoundingClientRect().height + 24
      : 20;
  }
  useEffect(() => {
    if (!jump || loading) return;
    const frame = requestAnimationFrame(() => {
      const section = sections.current.get(jump.id);
      if (section)
        window.scrollTo({
          top:
            section.getBoundingClientRect().top +
            window.scrollY -
            scrollOffset() +
            Math.min(jump.offset, Math.max(0, section.offsetHeight - 100)),
          behavior: jump.behavior,
        });
      setJump(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [jump, loading, groups]);
  useEffect(() => {
    if (loading || !groups.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (leaving.current) return;
      const line = scrollOffset() + 8;
      let current = groups[0].id;
      for (const group of groups) {
        const section = sections.current.get(group.id);
        if (section && section.getBoundingClientRect().top <= line)
          current = group.id;
      }
      setActiveCategoryId(current);
      if (restored.current && !jump) {
        const section = sections.current.get(current);
        remember(
          current,
          query,
          Math.max(
            0,
            scrollOffset() - (section?.getBoundingClientRect().top ?? 0),
          ),
        );
      }
      // Scroll the category rail itself, never the surrounding product page.
      const nav = rail.current;
      const button = nav?.querySelector<HTMLElement>(
        `[data-category-id="${current}"]`,
      );
      if (nav && button) {
        const container = nav.getBoundingClientRect();
        const target = button.getBoundingClientRect();
        if (getComputedStyle(nav).flexDirection === "column") {
          if (target.top < container.top)
            nav.scrollTop -= container.top - target.top;
          if (target.bottom > container.bottom)
            nav.scrollTop += target.bottom - container.bottom;
        } else {
          if (target.left < container.left)
            nav.scrollLeft -= container.left - target.left;
          if (target.right > container.right)
            nav.scrollLeft += target.right - container.right;
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [groups, loading, query, jump, remember]);
  function resetFilters() {
    setQuery("");
    setAvailableOnly(false);
    setFeaturedOnly(false);
    remember(selectedCategoryId ?? null, "", 0, {
      availableOnly: false,
      featuredOnly: false,
    });
  }
  function selectCategory(category: string) {
    setActiveCategoryId(category);
    setJump({
      id: category,
      offset: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    remember(category, query);
  }
  return (
    <AppShell
      title="Find your next favorite."
      mobileTitle="Menu"
      eyebrow="The Jayds menu"
      className="menu-browser"
      cart
    >
      <FulfillmentContext />
      <div className="menu-search mb-6">
        <label className="search-box">
          <Icon name="search" size={21} />
          <span className="sr-only">Search the menu</span>
          <input
            type="search"
            maxLength={120}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              remember(selectedCategoryId ?? null, e.target.value);
            }}
            placeholder="Coffee, food, or a little treat…"
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setQuery("");
                remember(selectedCategoryId ?? null, "");
              }}
              aria-label="Clear search"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </label>
      </div>
      <div
        className="menu-refinements"
        role="group"
        aria-label="Refine the menu"
      >
        <button
          type="button"
          className="menu-filter"
          aria-pressed={availableOnly}
          onClick={() => {
            const next = !availableOnly;
            setAvailableOnly(next);
            remember(selectedCategoryId ?? null, query, 0, {
              availableOnly: next,
              featuredOnly,
            });
          }}
        >
          <Icon name="check" size={17} /> Available
        </button>
        <button
          type="button"
          className="menu-filter"
          aria-pressed={featuredOnly}
          onClick={() => {
            const next = !featuredOnly;
            setFeaturedOnly(next);
            remember(selectedCategoryId ?? null, query, 0, {
              availableOnly,
              featuredOnly: next,
            });
          }}
        >
          <Icon name="star" size={17} /> Featured
        </button>
        {(availableOnly || featuredOnly) && (
          <button
            type="button"
            className="menu-filter-reset"
            onClick={resetFilters}
          >
            Reset filters
          </button>
        )}
      </div>
      <div className="browse-layout">
        <nav
          ref={rail}
          aria-label="Menu categories"
          className="category-list menu-category-rail"
        >
          {loading && !groups.length && <CategoryRailSkeleton />}
          {groups.map((category) => (
            <button
              type="button"
              key={category.id}
              className={`chip ${selectedCategoryId === category.id ? "chip-active" : ""}`}
              aria-current={
                selectedCategoryId === category.id ? "location" : undefined
              }
              aria-controls={`menu-category-${category.id}`}
              data-category-id={category.id}
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
          <div
            className="menu-results-summary"
            aria-live="polite"
            aria-atomic="true"
          >
            {query.trim() && <h2 className="section-title">Search results</h2>}
            <span className="text-xs text-text-secondary" role="status">
              {loading ? (
                "Loading the menu…"
              ) : (
                <>
                  <span>
                    {displayItems.length} product
                    {displayItems.length === 1 ? "" : "s"}
                  </span>
                  <span>
                    {query.trim()
                      ? ` matching “${query.trim()}”`
                      : " to explore"}
                    {availableOnly ? " · available" : ""}
                    {featuredOnly ? " · featured" : ""}
                  </span>
                </>
              )}
            </span>
          </div>
          {loading ? (
            <MenuSectionsSkeleton label={null} />
          ) : displayItems.length ? (
            groups.map((group) => (
              <section
                key={group.id}
                id={`menu-category-${group.id}`}
                aria-labelledby={`menu-heading-${group.id}`}
                className="menu-group"
                onClickCapture={(event) => {
                  if (
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.shiftKey &&
                    (event.target as Element).closest("a[href]")
                  ) {
                    leaving.current = true;
                    remember(
                      group.id,
                      query,
                      Math.max(
                        0,
                        scrollOffset() -
                          event.currentTarget.getBoundingClientRect().top,
                      ),
                    );
                  }
                }}
                ref={(element) => {
                  if (element) sections.current.set(group.id, element);
                  else sections.current.delete(group.id);
                }}
              >
                <div className="section-heading">
                  <h2 id={`menu-heading-${group.id}`} className="section-title">
                    {group.name}
                  </h2>
                  <span className="text-xs text-text-secondary">
                    {group.items.length} product
                    {group.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="product-grid">
                  {group.items.map((item) => (
                    <MenuCard item={item} key={item.id} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <EmptyState
              icon="search"
              title={
                menuItems.length
                  ? "No matches this time."
                  : "The menu is loading."
              }
              description={
                menuItems.length
                  ? "Try a different search or clear your filters to see more of the menu."
                  : "Reconnect and retry to see the café’s published products."
              }
              action={
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    resetFilters();
                    if (groups[0]) selectCategory(groups[0].id);
                    if (!menuItems.length) void refetch();
                  }}
                >
                  {menuItems.length ? "Show the full menu" : "Retry loading"}
                </button>
              }
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}
