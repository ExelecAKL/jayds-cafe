"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import type { CartItem, MenuItem, Order } from "@cafeos/shared/types";
import { useCart } from "../context/CartContext";
import { useCustomerToast } from "../context/CustomerToast";
import { customerHeaders } from "../context/CustomerFeatures";
import { useHomeRecommendations } from "../hooks/useHomeRecommendations";
import { buildReorderDraft } from "../utils/orderReorder";
import type { ReorderRecommendation } from "../utils/recommendations";
import { InlineNotice } from "./AppShell";
import MenuCard from "./MenuCard";
import ConfirmDialog from "./ConfirmDialog";
import { ProductCardSkeleton } from "./Skeletons";

function draftFor(entry: ReorderRecommendation) {
  return buildReorderDraft(
    {
      items: [
        {
          menu_item_id: entry.product.id,
          name: entry.product.name,
          price: entry.previous.price,
          variants: entry.previous.variants,
          quantity: 1,
          notes: "",
        },
      ],
    } as Order,
    [entry.product],
  );
}
interface Preview {
  product: MenuItem;
  line?: CartItem;
  issues: string[];
}
export default function HomeRecommendations({
  catalog,
}: {
  catalog: MenuItem[];
}) {
  const { user } = useAuth(),
    owner = user!.id;
  const cart = useCart(),
    router = useRouter(),
    notify = useCustomerToast();
  const { data, loading, error, refresh } = useHomeRecommendations(catalog);
  const [heading, setHeading] = useState("Just for You");
  const [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const active = useRef(true),
    operation = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPreview(null);
      setBusy(false);
      operation.current = false;
      try {
        const key = `jayds-home-discovery-heading:${owner}`;
        const next =
          sessionStorage.getItem(key) === "try" ? "Try This" : "Just for You";
        setHeading(next);
        sessionStorage.setItem(
          key,
          next === "Just for You" ? "try" : "for-you",
        );
      } catch {
        /* A blocked session store keeps the default heading. */
      }
    });
    return () => {
      cancelled = true;
      active.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate pending operations at cleanup; this is a counter, not a DOM ref.
      ++generation.current;
    };
  }, [owner]);

  async function check(
    productId: string,
    epoch: number,
  ): Promise<Preview | null> {
    const fresh = await refresh();
    if (!active.current || epoch !== generation.current) return null;
    if (!fresh)
      throw new Error(
        "Connect and retry to check today’s menu before reordering.",
      );
    const entry = fresh.orderAgain.find(
      (item) => item.product.id === productId,
    );
    if (!entry)
      throw new Error(
        "This product is no longer available to reorder. Please check the menu.",
      );
    const draft = draftFor(entry),
      line = draft.items[0];
    if (!line) return { product: entry.product, issues: draft.issues };
    const { data: availability, error: availabilityError } = await supabase.rpc(
      "get_configuration_availability",
      {
        p_item: productId,
        p_variants: line.variants,
        p_quantity: 1,
      },
    );
    await customerHeaders(owner);
    if (!active.current || epoch !== generation.current) return null;
    if (availabilityError || !availability)
      throw new Error("Availability could not be checked. Please retry.");
    if (!availability.available)
      return {
        product: entry.product,
        issues: [
          "Your previous options are unavailable. Choose another combination.",
        ],
      };
    return { product: entry.product, line, issues: draft.issues };
  }
  async function review(productId: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setActionError("");
    const epoch = generation.current;
    try {
      const next = await check(productId, epoch);
      if (active.current && epoch === generation.current && next)
        setPreview(next);
    } catch (error) {
      if (active.current && epoch === generation.current)
        setActionError(
          error instanceof Error ? error.message : "Please retry.",
        );
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        if (active.current) setBusy(false);
      }
    }
  }
  async function accept() {
    if (!preview || operation.current) return;
    if (!preview.line) {
      setPreview(null);
      router.push(`/menu/browse/${preview.product.id}`);
      return;
    }
    operation.current = true;
    setBusy(true);
    setActionError("");
    const epoch = generation.current;
    try {
      const checked = await check(preview.product.id, epoch);
      if (!checked || !active.current || epoch !== generation.current) return;
      if (
        !checked.line ||
        JSON.stringify(checked.line) !== JSON.stringify(preview.line)
      ) {
        setPreview({
          ...checked,
          issues: [
            ...checked.issues,
            "The menu changed during review. Please review it again.",
          ],
        });
        return;
      }
      await customerHeaders(owner);
      if (!active.current || epoch !== generation.current) return;
      cart.addItem(checked.line);
      notify(`${checked.line.quantity} × ${checked.line.name} is in your bag`, {
        icon: "bag",
      });
      setPreview(null);
      router.push("/cart");
    } catch (error) {
      if (active.current && epoch === generation.current)
        setActionError(
          error instanceof Error ? error.message : "Please retry.",
        );
    } finally {
      if (epoch === generation.current) {
        operation.current = false;
        if (active.current) setBusy(false);
      }
    }
  }
  const available = (entry: { product: MenuItem }) =>
    catalog.some(
      (item) =>
        item.id === entry.product.id &&
        item.is_available &&
        item.status === "active",
    );
  const orderAgain = data.orderAgain.filter(available),
    suggestions = data.suggestions.filter(available);
  return (
    <>
      {loading && !data.hasOrderHistory && !error && (
        <section
          className="home-personal-section mb-8"
          aria-label="Loading previous picks"
          aria-busy="true"
        >
          <div className="section-heading">
            <h2 className="section-title">Your usuals</h2>
          </div>
          <div
            className="home-reorder-rail product-grid skeleton-rail-row"
            aria-hidden="true"
          >
            <ProductCardSkeleton />
            <ProductCardSkeleton />
            <ProductCardSkeleton />
          </div>
        </section>
      )}
      {error && (
        <InlineNotice>
          {error}
          <button
            type="button"
            className="text-link ml-2"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </InlineNotice>
      )}
      {actionError && !preview && (
        <InlineNotice tone="error">{actionError}</InlineNotice>
      )}
      {data.hasOrderHistory && orderAgain.length > 0 && (
        <section
          className="home-personal-section mb-8"
          aria-labelledby="home-order-again-title"
        >
          <div className="section-heading">
            <h2 id="home-order-again-title" className="section-title">
              Order Again
            </h2>
            <span className="text-xs text-text-secondary">
              Your previous picks
            </span>
          </div>
          <div
            className="product-grid home-reorder-rail"
            aria-label="Previous orders"
          >
            {orderAgain.map((entry) => {
              const line = draftFor(entry).items[0];
              return (
                <MenuCard
                  key={entry.product.id}
                  item={entry.product}
                  configuration={line?.variants}
                  displayPrice={line?.price}
                  reason={
                    line
                      ? "Your previous options · 1 item"
                      : "Review your previous options"
                  }
                  action={{
                    label: "Order again",
                    disabled: busy || loading,
                    onClick: () => void review(entry.product.id),
                  }}
                />
              );
            })}
          </div>
        </section>
      )}
      {data.hasOrderHistory && suggestions.length > 0 && (
        <section
          className="home-personal-section mb-8"
          aria-labelledby="home-discovery-title"
        >
          <div className="section-heading">
            <h2 id="home-discovery-title" className="section-title">
              {heading}
            </h2>
            <span className="text-xs text-text-secondary">
              Inspired by your orders
            </span>
          </div>
          <div className="product-grid">
            {suggestions.map((entry) => (
              <MenuCard
                key={entry.product.id}
                item={entry.product}
                reason={entry.reason}
              />
            ))}
          </div>
        </section>
      )}
      <ConfirmDialog
        open={!!preview}
        title="Review your usual"
        busy={busy}
        confirmLabel={
          preview?.line ? "Add to my bag" : "Choose current options"
        }
        cancelLabel="Keep browsing"
        onCancel={() => {
          setPreview(null);
          setActionError("");
        }}
        onConfirm={() => void accept()}
      >
        <p className="font-semibold">{preview?.product.name}</p>
        {preview?.line && (
          <>
            <p className="mt-2">
              {preview.line.variants
                .map((variant) => variant.label)
                .join(" · ") || "As served"}
            </p>
            <p className="mt-2 font-semibold">
              1 item · ₱{preview.line.price.toFixed(2)}
            </p>
          </>
        )}
        {!!preview?.issues.length && (
          <ul className="mt-3 list-disc pl-5">
            {preview.issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        )}
        <p className="mt-3">
          {cart.items.length
            ? "Your existing bag is kept. This item will be added alongside it."
            : "Review today’s price and options before adding to your bag."}
        </p>
        <p className="mt-2 text-xs">
          Final availability and pricing are checked again at checkout.
        </p>
        {actionError && (
          <p className="mt-3 text-error" role="alert">
            {actionError}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
