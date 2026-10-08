"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "../../../../../components/OfflineMenuLink";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import { menuProductImageUrl } from "@cafeos/shared/utils/product-images";
import { useAvailability } from "@cafeos/shared/hooks/useAvailability";
import type { ItemVariant, SelectedVariant } from "@cafeos/shared/types";
import { useCart } from "../../../../../context/CartContext";
import AppShell, {
  EmptyState,
  InlineNotice,
} from "../../../../../components/AppShell";
import Icon from "../../../../../components/Icon";
import FavoriteButton from "../../../../../components/FavoriteButton";
import { categoryIcon } from "../../../../../utils/menuArtwork";

const labels: Record<string, string> = {
  temperature: "Temperature",
  size: "Cup size",
  sugar_level: "Sweetness",
  milk_sub: "Milk",
  add_on: "Add-on",
};
const ordering: Record<string, number> = {
  temperature: 1,
  size: 2,
  sugar_level: 3,
  milk_sub: 4,
  add_on: 5,
};
export default function BrowseMenuItemPage() {
  const params = useParams();
  const { menuItems, loading, error, refetch } = useMenu();
  const { addItem } = useCart();
  const item = menuItems.find((product) => product.id === params.id);
  const imageUrl = menuProductImageUrl(item?.id, item?.image_url);
  const [selected, setSelected] = useState<Record<string, ItemVariant>>({});
  const [quantity, setQuantity] = useState(1),
    [notes, setNotes] = useState(""),
    [added, setAdded] = useState(false),
    [online, setOnline] = useState(true);
  const groups = useMemo(() => {
    const result: Record<string, ItemVariant[]> = {};
    for (const v of item?.variants ?? []) {
      if (v.applicable_items && !v.applicable_items.includes(item!.id))
        continue;
      (result[v.variant_group] ??= []).push(v);
    }
    for (const values of Object.values(result))
      values.sort((a, b) => a.sort_order - b.sort_order);
    return result;
  }, [item]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setSelected({});
        setQuantity(1);
        setNotes("");
        setAdded(false);
      }
    });
    return () => {
      active = false;
    };
  }, [params.id]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSelected((previous) => {
        const next: Record<string, ItemVariant> = {};
        for (const [group, values] of Object.entries(groups)) {
          const current = values.find(
            (v) => v.id === previous[group]?.id && v.is_available !== false,
          );
          const chosen =
            current ??
            values.find((v) => v.is_default && v.is_available !== false);
          if (chosen) next[group] = chosen;
        }
        const temperature = next.temperature?.label;
        const sizes = (groups.size ?? []).filter(
          (v) =>
            v.is_available !== false &&
            (temperature === "Hot"
              ? v.label.includes("12oz")
              : temperature === "Iced"
                ? !v.label.includes("12oz")
                : true),
        );
        if (groups.size && !sizes.some((v) => v.id === next.size?.id)) {
          const size = sizes.find((v) => v.is_default) ?? sizes[0];
          if (size) next.size = size;
          else delete next.size;
        }
        return JSON.stringify(next) === JSON.stringify(previous)
          ? previous
          : next;
      });
    });
    return () => {
      active = false;
    };
  }, [groups]);
  const displayedGroups = useMemo(
    () =>
      Object.entries(groups)
        .map(
          ([group, values]) =>
            [
              group,
              group === "size"
                ? values.filter((v) =>
                    selected.temperature?.label === "Hot"
                      ? v.label.includes("12oz")
                      : selected.temperature?.label === "Iced"
                        ? !v.label.includes("12oz")
                        : true,
                  )
                : values,
            ] as const,
        )
        .sort((a, b) => (ordering[a[0]] ?? 99) - (ordering[b[0]] ?? 99)),
    [groups, selected.temperature],
  );
  const variants: SelectedVariant[] = Object.values(selected).map((v) => ({
    variant_group: v.variant_group,
    label: v.label,
    price_modifier: Number(v.price_modifier),
  }));
  const { availability, checking } = useAvailability(
    item?.id,
    variants,
    quantity,
  );
  const missing = Object.keys(groups).filter(
    (group) => group !== "add_on" && !selected[group],
  );
  const unitPrice =
    Number(item?.price ?? 0) +
    variants.reduce((sum, v) => sum + v.price_modifier, 0);
  const changeOption = (group: string, variant: ItemVariant) => {
    setAdded(false);
    setSelected((previous) => {
      const next = { ...previous, [group]: variant };
      if (group === "temperature" && groups.size) {
        const sizes = groups.size.filter(
          (v) =>
            v.is_available !== false &&
            (variant.label === "Hot"
              ? v.label.includes("12oz")
              : variant.label === "Iced"
                ? !v.label.includes("12oz")
                : true),
        );
        if (!sizes.some((v) => v.id === next.size?.id)) {
          const size = sizes.find((v) => v.is_default) ?? sizes[0];
          if (size) next.size = size;
          else delete next.size;
        }
      }
      return next;
    });
  };
  const canAdd =
    !!item?.is_available &&
    !missing.length &&
    !added &&
    (!online || !!availability?.available);
  const add = () => {
    if (!item || !canAdd) return;
    addItem({
      id: item.id,
      menu_item_id: item.id,
      name: item.name,
      price: unitPrice,
      quantity,
      variants,
      image_url: imageUrl,
      prep_time_minutes: item.prep_time_minutes,
      notes: notes.trim() || null,
    });
    setAdded(true);
  };
  if (loading)
    return (
      <AppShell title="Make it yours." backHref="/menu/browse">
        <div className="detail-layout">
          <div className="skeleton aspect-square rounded-3xl" />
          <div className="space-y-4">
            <div className="skeleton h-20" />
            <div className="skeleton h-44" />
            <div className="skeleton h-44" />
          </div>
        </div>
      </AppShell>
    );
  if (!item)
    return (
      <AppShell title="Back to the menu." backHref="/menu/browse">
        <EmptyState
          title="This item is unavailable."
          description="It may have left the current published menu. Your existing orders have not changed."
          action={
            <Link href="/menu/browse" className="btn-primary">
              Explore menu
            </Link>
          }
        />
      </AppShell>
    );
  return (
    <AppShell
      title="Make it yours."
      mobileTitle={item.name}
      eyebrow="Your Jayds order"
      backHref="/menu/browse"
      actions={<FavoriteButton item={item} />}
      className="product-detail pb-40"
    >
      {error && (
        <InlineNotice>
          Catalog updates could not load.
          <button onClick={() => void refetch()} className="text-link ml-2">
            Retry
          </button>
        </InlineNotice>
      )}
      {!online && (
        <InlineNotice>
          You’re browsing offline. Add to your draft; current stock and pricing
          will be checked online at checkout.
        </InlineNotice>
      )}
      {!item.is_available && (
        <InlineNotice>
          {item.availability_reason ||
            "This product is sold out. You can still view its options."}
        </InlineNotice>
      )}
      {online && availability?.reason && (
        <InlineNotice>{availability.reason}</InlineNotice>
      )}
      <div className="detail-layout">
        <section className="detail-image-section">
          <div className="detail-art">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={item.name}
                width={640}
                height={640}
              />
            ) : (
              <div className="product-placeholder">
                <Icon
                  name={categoryIcon(item.category?.name || item.name)}
                  size={100}
                />
                <span>JAYDS CAFÉ</span>
              </div>
            )}
          </div>
          <div className="detail-introduction mt-6">
            <p className="eyebrow">
              {item.is_featured ? "Café favorite" : "Made with care"}
            </p>
            <h2 className="font-display text-4xl font-semibold tracking-tight">
              {item.name}
            </h2>
            {item.description && (
              <p className="mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
                {item.description}
              </p>
            )}
            <p className="mt-4 text-2xl font-semibold">
              ₱{unitPrice.toFixed(2)}
              <span className="ml-2 text-xs font-normal text-text-secondary">
                per item
              </span>
            </p>
            {item.prep_time_minutes > 0 && (
              <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                <Icon name="clock" size={16} />
                Typical preparation: {item.prep_time_minutes} minutes
              </p>
            )}
          </div>
        </section>
        <div className="space-y-4">
          {displayedGroups.map(([group, values]) => (
            <fieldset className="detail-options" key={group}>
              <legend className="sr-only">
                {labels[group] ?? group.replaceAll("_", " ")}
              </legend>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-display text-xl font-semibold">
                  {labels[group] ?? group.replaceAll("_", " ")}
                </h3>
                <span className="text-xs text-text-secondary">
                  {group === "add_on" ? "Optional" : "Choose one"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {values.map((v) => {
                  const chosen = selected[group]?.id === v.id;
                  const disabled =
                    v.is_available === false ||
                    (online &&
                      availability?.options?.[`${group}:${v.label}`] === false);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={chosen}
                      className={`chip ${chosen ? "chip-active" : ""} disabled:opacity-45`}
                      onClick={() => changeOption(group, v)}
                    >
                      {chosen && (
                        <Icon name="check" size={14} className="mr-2" />
                      )}
                      {v.label}
                      {Number(v.price_modifier) > 0 && (
                        <span className="ml-2">
                          +₱{Number(v.price_modifier).toFixed(2)}
                        </span>
                      )}
                      {disabled && <span className="ml-1">· Sold out</span>}
                    </button>
                  );
                })}
                {group === "add_on" && selected[group] && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      setAdded(false);
                      setSelected((previous) => {
                        const next = { ...previous };
                        delete next[group];
                        return next;
                      });
                    }}
                  >
                    No add-on
                  </button>
                )}
              </div>
            </fieldset>
          ))}
          <section className="detail-options">
            <label
              htmlFor="item-notes"
              className="font-display text-xl font-semibold"
            >
              A little note
            </label>
            <p className="mt-1 text-xs text-text-secondary">
              Optional · instructions may affect preparation.
            </p>
            <textarea
              id="item-notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value.slice(0, 60));
                setAdded(false);
              }}
              maxLength={60}
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-bg-primary px-4 py-3"
              placeholder="Anything we should know?"
            />
            <p className="mt-1 text-right text-xs text-text-secondary">
              {notes.length}/60
            </p>
          </section>
          {missing.length > 0 && (
            <InlineNotice>
              Choose{" "}
              {missing
                .map((group) => labels[group] ?? group.replaceAll("_", " "))
                .join(", ")}{" "}
              before adding.
            </InlineNotice>
          )}
          {added && (
            <InlineNotice tone="success">
              Added to your bag.
              <div className="flex flex-wrap gap-x-5">
                <Link href="/menu/browse" className="text-link">
                  Keep browsing
                  <Icon name="arrowRight" size={16} />
                </Link>
                <Link href="/cart" className="text-link">
                  View bag
                </Link>
              </div>
            </InlineNotice>
          )}
        </div>
      </div>
      <div className="detail-addbar">
        <div className="portrait-only detail-mobile-summary">
          <p title={variants.map((v) => v.label).join(" · ")}>
            {variants.length
              ? variants.map((v) => v.label).join(" · ")
              : "Made with care at Jayds"}
          </p>
          <strong>₱{(unitPrice * quantity).toFixed(2)}</strong>
        </div>
        <div className="detail-addbar-inner">
          <div className="quantity-control">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity === 1}
              onClick={() => {
                setQuantity((q) => Math.max(1, q - 1));
                setAdded(false);
              }}
            >
              <Icon name="minus" size={18} />
            </button>
            <span aria-label="Quantity">{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={quantity >= 99}
              onClick={() => {
                setQuantity((q) => Math.min(99, q + 1));
                setAdded(false);
              }}
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
          {added ? (
            <Link className="btn-primary flex-1" href="/cart">
              View bag <Icon name="arrowRight" size={18} />
            </Link>
          ) : (
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!canAdd}
              onClick={add}
            >
              {added ? (
                "Added to bag"
              ) : checking && online && !availability ? (
                "Checking stock…"
              ) : !item.is_available ? (
                "Sold out"
              ) : (
                <>
                  Add to bag
                  <span className="wide-screen-title">
                    {" "}
                    · ₱{(unitPrice * quantity).toFixed(2)}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
