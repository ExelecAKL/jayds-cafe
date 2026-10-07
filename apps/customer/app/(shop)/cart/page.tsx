"use client";
import { useEffect, useRef, useState } from "react";
import Link from "../../../components/OfflineMenuLink";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import type { CartItem } from "@cafeos/shared/types";
import { useCart } from "../../../context/CartContext";
import AppShell, {
  EmptyState,
  InlineNotice,
} from "../../../components/AppShell";
import ConfirmDialog from "../../../components/ConfirmDialog";
import Icon from "../../../components/Icon";
export default function CartPage() {
  const cart = useCart(),
    { user } = useAuth(),
    owner = user?.id ?? "guest";
  const { menuItems, loading, error } = useMenu();
  const [removed, setRemoved] = useState<{
    item: CartItem;
    owner: string;
  } | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    owner: string;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [clearOwner, setClearOwner] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    owner: string;
    text: string;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const issues = loading
    ? []
    : cart.items.flatMap((line) => {
        const p = menuItems.find((p) => p.id === line.menu_item_id);
        if (!p || !p.is_available) return [line.name + " is unavailable."];
        const mods = line.variants.map((v) =>
          p.variants?.find(
            (m) => m.variant_group === v.variant_group && m.label === v.label,
          ),
        );
        if (mods.some((m) => !m || m.is_available === false))
          return [
            line.name + " has changed options. Review its configuration.",
          ];
        const price =
          Math.round(
            (Number(p.price) +
              mods.reduce((s, m) => s + Number(m?.price_modifier ?? 0), 0)) *
              100,
          ) / 100;
        return price !== line.price
          ? [line.name + " has a changed price. Review before ordering."]
          : [];
      });
  function remove(item: CartItem) {
    cart.removeItem(item.id);
    setRemoved({ item, owner });
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRemoved(null), 12000);
  }
  function undo() {
    if (removed?.owner !== owner) return;
    cart.addItem(removed.item);
    setMessage({ owner, text: removed.item.name + " restored." });
    setRemoved(null);
    if (timer.current) clearTimeout(timer.current);
  }
  function discard() {
    if (clearOwner !== owner) return;
    cart.clearCart();
    setRemoved(null);
    setEditing(null);
    setClearOwner(null);
    setMessage({ owner, text: "Your bag was cleared." });
    if (timer.current) clearTimeout(timer.current);
  }
  return (
    <AppShell
      title="Good things in your bag."
      eyebrow="Your Jayds order"
      backHref="/menu/browse"
      className="customer-cart-page"
      actions={
        cart.items.length ? (
          <button
            className="icon-button"
            aria-label="Clear your bag"
            onClick={() => setClearOwner(owner)}
          >
            <Icon name="close" />
          </button>
        ) : undefined
      }
    >
      {removed?.owner === owner && (
        <InlineNotice>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{removed.item.name} removed.</span>
            <button className="text-link" onClick={undo}>
              Undo removal
            </button>
          </div>
        </InlineNotice>
      )}
      {message?.owner === owner && (
        <InlineNotice tone="success">{message.text}</InlineNotice>
      )}
      {!cart.hydrated ? (
        <div className="space-y-4">
          <div className="skeleton h-40" />
          <div className="skeleton h-40" />
        </div>
      ) : !cart.items.length ? (
        <EmptyState
          icon="bag"
          title="A little room for your favorites."
          description="Find coffee, something sweet, or a café treat. Your unfinished bag is saved on this device."
          action={
            <Link href="/menu/browse" className="btn-primary">
              Explore the menu
            </Link>
          }
        />
      ) : (
        <>
          {(error || issues.length > 0) && (
            <InlineNotice>
              {error
                ? "Catalog updates could not load. Reconnect to confirm current prices and availability."
                : issues.map((issue, i) => <p key={i}>{issue}</p>)}
              <p className="mt-2 text-xs">
                Your draft is retained. Stock, pricing and rewards are confirmed
                online before acceptance.
              </p>
            </InlineNotice>
          )}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0 space-y-4">
              <div className="section-heading">
                <h2 className="section-title">
                  {cart.itemCount} items for you
                </h2>
                <Link href="/menu/browse" className="text-link">
                  Add more
                  <Icon name="plus" size={17} />
                </Link>
              </div>
              {cart.items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-3xl border border-border bg-bg-card p-4 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <Link
                      href={"/menu/browse/" + item.menu_item_id}
                      className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-bg-elevated"
                      aria-label={"View " + item.name}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          width={80}
                          height={80}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Icon name="coffee" size={32} />
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-xl font-semibold leading-tight">
                        {item.name}
                      </h3>
                      {item.variants.length > 0 && (
                        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                          {item.variants.map((v) => v.label).join(" · ")}
                        </p>
                      )}
                      <p className="mt-2 text-sm font-semibold">
                        ₱{item.price.toFixed(2)} each
                      </p>
                    </div>
                    <button
                      className="icon-button !h-12 !w-12 shrink-0"
                      aria-label={"Remove " + item.name}
                      onClick={() => remove(item)}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                  {item.notes && (
                    <p className="mt-4 rounded-xl bg-bg-primary p-3 text-sm">
                      Note: {item.notes}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <button
                      className="text-link"
                      onClick={() => {
                        setEditing({ id: item.id, name: item.name, owner });
                        setNotes(item.notes ?? "");
                      }}
                    >
                      {item.notes ? "Edit note" : "Add item note"}
                    </button>
                    <div className="quantity-control">
                      <button
                        aria-label={"Decrease " + item.name + " quantity"}
                        disabled={item.quantity <= 1}
                        onClick={() =>
                          cart.updateQuantity(item.id, item.quantity - 1)
                        }
                      >
                        <Icon name="minus" size={17} />
                      </button>
                      <span aria-label={item.name + " quantity"}>
                        {item.quantity}
                      </span>
                      <button
                        aria-label={"Increase " + item.name + " quantity"}
                        disabled={item.quantity >= 99}
                        onClick={() =>
                          cart.updateQuantity(item.id, item.quantity + 1)
                        }
                      >
                        <Icon name="plus" size={17} />
                      </button>
                    </div>
                    <strong>₱{(item.price * item.quantity).toFixed(2)}</strong>
                  </div>
                </article>
              ))}
              <details className="rounded-3xl border border-border bg-bg-card p-5">
                <summary className="min-h-12 cursor-pointer font-semibold">
                  A note for the whole order
                </summary>
                <label className="sr-only" htmlFor="cart-order-note">
                  Order note
                </label>
                <textarea
                  id="cart-order-note"
                  value={cart.orderNote}
                  onChange={(e) => cart.setOrderNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Anything the café should know?"
                  className="mt-3 w-full rounded-xl border border-border bg-bg-primary p-3"
                />
                <p className="text-xs text-text-secondary">
                  Notes are requests and do not change the selected recipe.
                </p>
              </details>
            </div>
            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <section className="surface-card p-5">
                <h2 className="section-title">Your order, your way.</h2>
                <div className="segmented-control mt-4">
                  {(["pickup", "delivery"] as const).map((type) => (
                    <button
                      key={type}
                      className={cart.orderType === type ? "is-selected" : ""}
                      aria-pressed={cart.orderType === type}
                      onClick={() => cart.setOrderType(type)}
                    >
                      {type === "pickup" ? "Pickup" : "Delivery"}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-text-secondary">
                  {cart.orderType === "delivery"
                    ? "Choose your destination and review the courier fee at checkout."
                    : "Choose available pickup timing at checkout. Pickup is available from anywhere."}
                </p>
              </section>
              <section className="surface-card p-5">
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt>Subtotal</dt>
                    <dd>₱{cart.subtotal.toFixed(2)}</dd>
                  </div>
                  {cart.discount > 0 && (
                    <div className="flex justify-between">
                      <dt>Draft discount</dt>
                      <dd>−₱{cart.discount.toFixed(2)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-4">
                    <dt>Draft total</dt>
                    <dd className="text-2xl font-semibold">
                      ₱{cart.total.toFixed(2)}
                    </dd>
                  </div>
                </dl>
                <Link className="text-link mt-4" href="/vouchers">
                  Browse vouchers
                </Link>
                {cart.voucher && (
                  <p className="mt-2 text-xs">
                    Voucher {cart.voucher.code} will be validated online.
                  </p>
                )}
                <Link
                  className="btn-primary mt-5 hidden w-full lg:inline-flex"
                  href="/checkout"
                >
                  Review checkout
                  <Icon name="arrowRight" size={18} />
                </Link>
                <p className="mt-4 text-xs text-text-secondary">
                  Nothing is submitted yet. Delivery fees are quoted at
                  checkout.
                </p>
              </section>
            </aside>
          </div>
          <div className="cart-mobile-checkout">
            <div className="flex-1">
              <p className="text-xs text-text-secondary">
                Draft total
                {cart.orderType === "delivery" ? " · delivery extra" : ""}
              </p>
              <strong className="text-xl">₱{cart.total.toFixed(2)}</strong>
            </div>
            <Link className="btn-primary" href="/checkout">
              Checkout
              <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </>
      )}
      <ConfirmDialog
        open={clearOwner === owner && cart.items.length > 0}
        title="Start with an empty bag?"
        confirmLabel="Clear bag"
        cancelLabel="Keep my items"
        onConfirm={discard}
        onCancel={() => setClearOwner(null)}
      >
        <p>
          Your items, notes and applied voucher will be removed from this draft.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={editing?.owner === owner}
        title={editing ? "A note for " + editing.name : "Item note"}
        confirmLabel="Save note"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (editing?.owner !== owner) return;
          cart.updateItemNotes(editing.id, notes.trim());
          setEditing(null);
          setMessage({ owner, text: "Your item note was saved." });
        }}
        onCancel={() => setEditing(null)}
      >
        <label className="block" htmlFor="edit-item-note">
          Optional request for this item
        </label>
        <textarea
          id="edit-item-note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={60}
          rows={3}
          className="mt-2 w-full rounded-xl border border-border p-3"
        />
        <p className="mt-2 text-xs">
          {notes.length}/60 · Your configuration stays unchanged.
        </p>
      </ConfirmDialog>
    </AppShell>
  );
}
