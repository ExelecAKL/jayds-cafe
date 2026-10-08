"use client";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { menuProductImageUrl } from "@cafeos/shared/utils/product-images";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import { supabase } from "@cafeos/shared/supabase/client";
import type { MenuItem } from "@cafeos/shared/types";
import type {
  RegisterDraft,
  RegisterLine,
  RegisterOption,
  RegisterCustomer,
} from "@cafeos/shared/pos/types";
import {
  addLine,
  draftTotals,
  emptyDraft,
  lineTotal,
  pesos,
} from "@cafeos/shared/pos/draft";
import {
  cashierRequest,
  CashierRequestError,
  useOnline,
  useRegisterDraft,
} from "../lib/client";
import { PosShell } from "./PosShell";
import { PosConfirm, PosDialog, PosIcon } from "./PosPrimitives";
import { ProductOptions, productDefaults } from "./ProductOptions";
import { CheckoutPanel } from "./CheckoutPanel";
import { QRScanner } from "./QRScanner";

export function Register({ parkedId }: { parkedId?: string }) {
  const { user } = useAuth(),
    router = useRouter(),
    online = useOnline();
  const {
    menuItems,
    categories,
    loading,
    error: menuError,
    refetch,
  } = useMenu();
  const [draft, update] = useRegisterDraft(user?.id ?? "signed-out");
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState<string | null>(null),
    [page, setPage] = useState(0),
    [categoryPage, setCategoryPage] = useState(0);
  const [capacity, setCapacity] = useState({
      columns: 3,
      rows: 2,
      categories: 3,
    }),
    grid = useRef<HTMLDivElement>(null);
  const [option, setOption] = useState<{
      item: MenuItem;
      line?: RegisterLine;
    } | null>(null),
    [undo, setUndo] = useState<RegisterLine | null>(null),
    [clear, setClear] = useState(false),
    [panel, setPanel] = useState<"notes" | "loyalty" | null>(null),
    [scanner, setScanner] = useState(false),
    [accountCode, setAccountCode] = useState("");
  const [checkout, setCheckout] = useState(false),
    [dismissed, setDismissed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [mobileTicket, setMobileTicket] = useState(false);
  const [replaceParked, setReplaceParked] = useState<RegisterDraft | null>(
      null,
    ),
    loadedParked = useRef(""),
    busyRef = useRef(false);
  const [adding, setAdding] = useState(0),
    pendingAdditions = useRef(0);
  const totals = draftTotals(draft),
    locked = !!(draft.pending_checkout || draft.pending_park);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCapacity({
        columns: width < 500 ? 2 : width < 750 ? 3 : width < 1100 ? 4 : 5,
        rows: Math.max(1, Math.min(4, Math.floor(height / 180))),
        categories: Math.max(1, Math.floor((width - 110) / 125)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!parkedId || !user || loading || loadedParked.current === parkedId)
      return;
    let active = true;
    void (async () => {
      const { data, error: failure } = await supabase
        .from("orders")
        .select(
          "id,status,is_parked,payment_status,notes,customer:profiles!orders_customer_id_fkey(id,email,full_name,points),items:order_items(menu_item_id,name,price,quantity,variants,notes)",
        )
        .eq("id", parkedId)
        .single();
      if (!active) return;
      loadedParked.current = parkedId;
      if (
        failure ||
        !data ||
        !data.is_parked ||
        data.status !== "pending" ||
        data.payment_status !== "pending"
      ) {
        setError(
          "This ticket cannot be edited. Only parked, unpaid tickets can be reopened.",
        );
        return;
      }
      const customer = (
        Array.isArray(data.customer) ? data.customer[0] : data.customer
      ) as RegisterCustomer | null;
      const restored: RegisterDraft = {
        ...emptyDraft(),
        parked_order_id: data.id,
        notes: (data.notes ?? "").replace(/^\[PARKED\]\s*/, ""),
        customer,
        items: data.items.map((i) => {
          const current = menuItems.find((m) => m.id === i.menu_item_id);
          const variants = (i.variants ?? []) as RegisterOption[];
          return {
            line_id: createUuid(),
            menu_item_id: i.menu_item_id,
            name: current?.name ?? i.name,
            price:
              current?.price ??
              Number(i.price) -
                variants.reduce((n, v) => n + v.price_modifier, 0),
            quantity: i.quantity,
            notes: i.notes ?? "",
            image_url: menuProductImageUrl(current?.id, current?.image_url),
            variants: variants.map((v) => ({
              ...v,
              price_modifier:
                current?.variants?.find(
                  (c) =>
                    c.variant_group === v.variant_group && c.label === v.label,
                )?.price_modifier ?? v.price_modifier,
            })),
          };
        }),
      };
      if (locked) {
        setError(
          "Resolve the pending payment before reopening another ticket.",
        );
        return;
      }
      if (draft.items.length && draft.parked_order_id !== parkedId)
        setReplaceParked(restored);
      else update(restored);
      setToast("Parked ticket reopened. Review current prices before payment.");
    })();
    return () => {
      active = false;
    };
  }, [
    parkedId,
    user,
    loading,
    menuItems,
    draft.items.length,
    draft.parked_order_id,
    locked,
    update,
  ]);
  const shown = menuItems.filter(
    (item) =>
      (!category || item.category_id === category) &&
      item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const perPage = capacity.columns * capacity.rows,
    pages = Math.max(1, Math.ceil(shown.length / perPage)),
    currentPage = Math.min(page, pages - 1);
  const categoryPages = Math.max(
      1,
      Math.ceil((categories.length + 1) / capacity.categories),
    ),
    currentCategoryPage = Math.min(categoryPage, categoryPages - 1);
  const categoryList = [
    { id: null, name: "All products" },
    ...categories,
  ].slice(
    currentCategoryPage * capacity.categories,
    (currentCategoryPage + 1) * capacity.categories,
  );
  const insert = (
    item: MenuItem,
    variants: RegisterOption[],
    notes = "",
    quantity = 1,
    replacing?: string,
  ) => {
    update((previous) =>
      previous.pending_checkout || previous.pending_park
        ? previous
        : {
            ...previous,
            items: addLine(
              previous.items,
              {
                line_id: replacing ?? createUuid(),
                menu_item_id: item.id,
                name: item.name,
                price: item.price,
                quantity,
                variants,
                notes,
                image_url: menuProductImageUrl(item.id, item.image_url),
              },
              replacing,
            ),
          },
    );
    setOption(null);
    setError("");
    setToast(item.name + " added");
  };
  const quickAdd = async (item: MenuItem) => {
    if (locked || busyRef.current) return;
    pendingAdditions.current++;
    setAdding(pendingAdditions.current);
    try {
      const variants = productDefaults(item);
      if (online) {
        const { data, error: failure } = await supabase.rpc(
          "get_configuration_availability",
          { p_item: item.id, p_variants: variants, p_quantity: 1 },
        );
        if (failure && failure.code !== "PGRST202") {
          setError(failure.message);
          return;
        }
        if (data && !data.available) {
          setOption({ item });
          setError(data.reason ?? "Choose an available configuration");
          return;
        }
      }
      insert(item, variants);
    } finally {
      pendingAdditions.current--;
      setAdding(pendingAdditions.current);
    }
  };
  const remove = (line: RegisterLine) => {
    setUndo(line);
    update((previous) => ({
      ...previous,
      items: previous.items.filter((i) => i.line_id !== line.line_id),
    }));
  };
  const quantity = (line: RegisterLine, delta: number) => {
    if (line.quantity + delta < 1) {
      remove(line);
      return;
    }
    update((previous) => ({
      ...previous,
      items: previous.items.map((i) =>
        i.line_id === line.line_id ? { ...i, quantity: i.quantity + delta } : i,
      ),
    }));
  };
  const review = () => {
    if (pendingAdditions.current) return;
    setError("");
    if (locked) {
      setDismissed(false);
      setCheckout(true);
      return;
    }
    if (!online) {
      setError("Connect before checkout. Your draft is saved.");
      return;
    }
    try {
      let changed = false;
      const items = draft.items.map((line) => {
        const current = menuItems.find((i) => i.id === line.menu_item_id);
        if (!current || !current.is_available)
          throw new Error(
            line.name + " is unavailable. Remove it or choose another product.",
          );
        const variants = line.variants.map((v) => {
          const variant = current.variants?.find(
            (c) =>
              c.variant_group === v.variant_group &&
              c.label === v.label &&
              (!c.applicable_items || c.applicable_items.includes(current.id)),
          );
          if (!variant)
            throw new Error(
              line.name +
                ": " +
                v.label +
                " is no longer available. Review its options.",
            );
          if (variant.price_modifier !== v.price_modifier) changed = true;
          return { ...v, price_modifier: variant.price_modifier };
        });
        if (current.price !== line.price) changed = true;
        return { ...line, name: current.name, price: current.price, variants };
      });
      if (changed) {
        update((previous) => ({ ...previous, items }));
        setError(
          "Menu prices changed. Review the updated ticket, then tap Pay again.",
        );
        return;
      }
      setDismissed(false);
      setCheckout(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Review the ticket before payment.",
      );
    }
  };
  const submittedItems = draft.items.map((line) => ({
    menu_item_id: line.menu_item_id,
    name: line.name,
    price: line.price,
    quantity: line.quantity,
    variants: line.variants,
    notes: line.notes || null,
  }));
  const base = {
    items: submittedItems,
    customer_id: draft.customer?.id ?? null,
    points_redeemed: totals.points,
    notes: draft.notes,
    parked_order_id: draft.parked_order_id,
  };
  const park = async () => {
    if (
      busyRef.current ||
      draft.pending_checkout ||
      !online ||
      pendingAdditions.current
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const body = {
      ...base,
      points_redeemed: 0,
      parked: true,
      payment_method: "cash",
    };
    const request = draft.pending_park ?? {
      key: createUuid(),
      payload: body,
    };
    update((previous) => ({ ...previous, pending_park: request }));
    try {
      await cashierRequest("/api/orders/create", request.payload, request.key);
      update(emptyDraft());
      router.replace("/new-order");
      setToast("Ticket parked. No stock is reserved.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not park the ticket. Your draft is retained.",
      );
      if (
        failure instanceof CashierRequestError &&
        failure.status >= 400 &&
        failure.status < 500
      )
        update((previous) => ({ ...previous, pending_park: undefined }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const lookup = async (qr: string) => {
    setScanner(false);
    setBusy(true);
    try {
      const { customer } = await cashierRequest<{ customer: RegisterCustomer }>(
        "/api/account/lookup",
        { qr },
      );
      update((previous) => ({ ...previous, customer, points: 0 }));
      setPanel("loyalty");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Account could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <PosShell
      title="Register"
      actions={
        <button
          className="pos-button mobile-ticket-toggle"
          onClick={() => setMobileTicket((v) => !v)}
        >
          {mobileTicket ? "Menu" : "Ticket"} · {totals.count}
        </button>
      }
    >
      <div
        className={
          "register-layout " + (mobileTicket ? "mobile-show-ticket" : "")
        }
      >
        <section className="catalog-panel" aria-label="Products">
          <div className="catalog-search">
            <PosIcon name="search" />
            <input
              className="pos-field"
              aria-label="Search products"
              placeholder="Search products…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            <button
              className="pos-icon-button"
              aria-label="Refresh catalog"
              onClick={() => void refetch()}
            >
              <PosIcon name="refresh" />
            </button>
          </div>
          <div className="catalog-categories">
            <button
              className="pos-icon-button"
              aria-label="Previous categories"
              disabled={currentCategoryPage === 0}
              onClick={() => setCategoryPage((p) => p - 1)}
            >
              <PosIcon name="left" />
            </button>
            <div className="catalog-category-list">
              {categoryList.map((c) => (
                <button
                  key={c.id ?? "all"}
                  className={category === c.id ? "is-selected" : ""}
                  aria-pressed={category === c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setPage(0);
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <button
              className="pos-icon-button"
              aria-label="Next categories"
              disabled={currentCategoryPage + 1 >= categoryPages}
              onClick={() => setCategoryPage((p) => p + 1)}
            >
              <PosIcon name="right" />
            </button>
          </div>
          <div
            ref={grid}
            className="catalog-products"
            style={
              {
                "--columns": capacity.columns,
                "--rows": capacity.rows,
              } as CSSProperties
            }
          >
            {loading ? (
              <div className="pos-empty">Loading menu…</div>
            ) : (
              shown
                .slice(currentPage * perPage, (currentPage + 1) * perPage)
                .map((item) => (
                  <article className="product-card" key={item.id}>
                    <button
                      className="product-main"
                      disabled={!item.is_available || locked}
                      aria-label={"Add " + item.name}
                      onClick={() => void quickAdd(item)}
                    >
                      <div className="product-image">
                        {menuProductImageUrl(item.id, item.image_url) ? (
                          <img
                            src={menuProductImageUrl(item.id, item.image_url)!}
                            alt=""
                            loading="lazy"
                            width={320}
                            height={320}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <PosIcon name="coffee" size={32} />
                        )}
                      </div>
                      <strong className="product-name">{item.name}</strong>
                      <div className="product-price">
                        <span className="pos-number">
                          {pesos(
                            item.price +
                              productDefaults(item).reduce(
                                (n, v) => n + v.price_modifier,
                                0,
                              ),
                          )}
                        </span>
                        <PosIcon name="plus" size={18} />
                      </div>
                    </button>
                    <button
                      className="product-options"
                      disabled={locked || !item.is_available}
                      aria-label={"Options for " + item.name}
                      onClick={() => setOption({ item })}
                    >
                      <PosIcon name="edit" size={14} />
                      {item.variants?.length ? "Options" : "Item notes"}
                    </button>
                    {!item.is_available && (
                      <span className="product-unavailable">Sold out</span>
                    )}
                  </article>
                ))
            )}
            {!loading && !shown.length && (
              <div className="pos-empty">
                <PosIcon name="search" size={32} />
                <strong>No products found</strong>
                <span>Try another search or category.</span>
              </div>
            )}
          </div>
          <div className="catalog-pagination">
            <span>
              {shown.length} products{menuError ? " · " + menuError : ""}
            </span>
            <div>
              <button
                className="pos-button"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                <PosIcon name="left" />
                Previous
              </button>
              <span>
                {currentPage + 1} / {pages}
              </span>
              <button
                className="pos-button"
                disabled={currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
                <PosIcon name="right" />
              </button>
            </div>
          </div>
        </section>
        <aside className="ticket-panel" aria-label="Current ticket">
          <header className="ticket-heading">
            <div>
              <h2>
                {draft.parked_order_id ? "Reopened ticket" : "Current ticket"}
              </h2>
              <p className="pos-muted">
                {draft.pending_park
                  ? "Park confirmation pending"
                  : locked
                    ? "Confirmation pending"
                    : "Draft saved on this terminal"}
              </p>
            </div>
            <button
              className="pos-icon-button"
              aria-label="Clear ticket"
              disabled={locked || !draft.items.length}
              onClick={() => setClear(true)}
            >
              <PosIcon name="trash" />
            </button>
          </header>
          <div className="ticket-lines">
            {draft.items.length ? (
              draft.items.map((line) => (
                <div className="ticket-line" key={line.line_id}>
                  <div className="ticket-line-title">
                    <button
                      disabled={locked}
                      onClick={() => {
                        const item = menuItems.find(
                          (i) => i.id === line.menu_item_id,
                        );
                        if (item) setOption({ item, line });
                        else
                          setError(
                            "This product is no longer published. Remove it from the ticket.",
                          );
                      }}
                      aria-label={"Edit " + line.name}
                    >
                      <strong>{line.name}</strong>
                      {line.variants.length > 0 && (
                        <small>
                          {line.variants.map((v) => v.label).join(" · ")}
                        </small>
                      )}
                      {line.notes && <small>Note: {line.notes}</small>}
                    </button>
                    <button
                      className="pos-icon-button"
                      aria-label={"Remove " + line.name}
                      disabled={locked}
                      onClick={() => remove(line)}
                    >
                      <PosIcon name="close" size={16} />
                    </button>
                  </div>
                  <div className="ticket-line-controls">
                    <div className="quantity-control">
                      <button
                        className="pos-icon-button"
                        aria-label={"Decrease " + line.name}
                        disabled={locked}
                        onClick={() => quantity(line, -1)}
                      >
                        <PosIcon name="minus" size={16} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        className="pos-icon-button"
                        aria-label={"Increase " + line.name}
                        disabled={locked}
                        onClick={() => quantity(line, 1)}
                      >
                        <PosIcon name="plus" size={16} />
                      </button>
                    </div>
                    <strong className="ticket-line-price pos-number">
                      {pesos(lineTotal(line))}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <div className="pos-empty">
                <PosIcon name="register" size={40} />
                <strong>Start a new sale</strong>
                <span>Tap a product to add its default configuration.</span>
              </div>
            )}
          </div>
          <footer className="ticket-footer">
            {undo && !locked && (
              <div className="ticket-undo">
                <span>Item removed</span>
                <button
                  onClick={() => {
                    update((previous) => ({
                      ...previous,
                      items: addLine(previous.items, undo),
                    }));
                    setUndo(null);
                  }}
                >
                  Undo
                </button>
              </div>
            )}
            {error && (
              <p className="pos-error" role="alert">
                {error}
              </p>
            )}
            <div className="ticket-tools">
              <button
                className={"pos-button " + (draft.customer ? "is-linked" : "")}
                disabled={locked || busy}
                onClick={() => setPanel("loyalty")}
              >
                <PosIcon name="user" size={16} />
                {draft.customer ? "Loyalty" : "Customer"}
              </button>
              <button
                className="pos-button"
                disabled={locked}
                onClick={() => setPanel("notes")}
              >
                <PosIcon name="note" size={16} />
                Notes{draft.notes ? " •" : ""}
              </button>
              <button
                className="pos-button"
                disabled={
                  !!draft.pending_checkout ||
                  busy ||
                  !online ||
                  !draft.items.length ||
                  adding > 0
                }
                onClick={() => void park()}
              >
                <PosIcon name="pause" size={16} />
                {busy ? "Saving…" : draft.pending_park ? "Retry park" : "Park"}
              </button>
            </div>
            <div className="ticket-subtotal">
              <span>{totals.count} items · Subtotal</span>
              <span className="pos-number">{pesos(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="ticket-subtotal">
                <span>Loyalty · {totals.points} points</span>
                <span>− {pesos(totals.discount)}</span>
              </div>
            )}
            <div className="ticket-total">
              <span>Total</span>
              <strong className="pos-number">{pesos(totals.total)}</strong>
            </div>
            <button
              className="pos-button pos-primary ticket-pay"
              disabled={
                !draft.items.length ||
                busy ||
                !online ||
                adding > 0 ||
                !!draft.pending_park
              }
              onClick={review}
            >
              <PosIcon name="wallet" />
              {draft.pending_checkout ? "Recover payment" : "Pay"} ·{" "}
              {pesos(totals.total)}
            </button>
          </footer>
        </aside>
      </div>
      {toast && (
        <div className="pos-toast" role="status">
          {toast}
        </div>
      )}
      {option && (
        <ProductOptions
          item={option.item}
          line={option.line}
          onClose={() => setOption(null)}
          onSave={(variants, notes, qty) =>
            insert(option.item, variants, notes, qty, option.line?.line_id)
          }
        />
      )}
      {(checkout || (draft.pending_checkout && !dismissed)) && (
        <CheckoutPanel
          total={totals.total}
          items={draft.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            subtotal: lineTotal(i),
            details: [...i.variants.map((v) => v.label), i.notes]
              .filter(Boolean)
              .join(" · "),
          }))}
          base={base}
          pending={draft.pending_checkout}
          onPending={(pending) =>
            update((previous) => ({ ...previous, pending_checkout: pending }))
          }
          onPaid={() => {
            update(emptyDraft());
            setUndo(null);
            setCheckout(true);
          }}
          onClose={() => {
            setCheckout(false);
            setDismissed(true);
            router.replace("/new-order");
          }}
        />
      )}
      {clear && (
        <PosConfirm
          title="Clear this ticket?"
          message="Discard the saved draft and start a new sale."
          onCancel={() => setClear(false)}
          onConfirm={() => {
            update(emptyDraft());
            setUndo(null);
            setClear(false);
            setError("");
            router.replace("/new-order");
          }}
        />
      )}
      {replaceParked && (
        <PosConfirm
          title="Replace the current draft?"
          message="Reopening this parked ticket will replace your unfinished local ticket."
          onCancel={() => {
            setReplaceParked(null);
            router.replace("/new-order");
          }}
          onConfirm={() => {
            update(replaceParked);
            setReplaceParked(null);
          }}
        />
      )}
      {panel === "notes" && (
        <PosDialog title="Order notes" onClose={() => setPanel(null)}>
          <div className="pos-dialog-body">
            <p className="pos-muted">Instructions for the whole ticket.</p>
            <textarea
              className="pos-field"
              rows={5}
              maxLength={1000}
              aria-label="Order notes"
              value={draft.notes}
              onChange={(e) =>
                update((previous) => ({ ...previous, notes: e.target.value }))
              }
            />
          </div>
          <footer className="pos-dialog-footer">
            <button
              className="pos-button pos-primary"
              onClick={() => setPanel(null)}
            >
              Done
            </button>
          </footer>
        </PosDialog>
      )}
      {panel === "loyalty" && (
        <PosDialog title="Customer & loyalty" onClose={() => setPanel(null)}>
          <div className="pos-dialog-body">
            {draft.customer ? (
              <>
                <h3>{draft.customer.full_name || draft.customer.email}</h3>
                <p className="pos-muted">
                  {draft.customer.points} points available · 10 points = ₱1
                </p>
                <label htmlFor="loyalty-points">Redeem points</label>
                <input
                  id="loyalty-points"
                  className="pos-field"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={Math.min(
                    draft.customer.points,
                    Math.floor(totals.subtotal * 10),
                  )}
                  value={draft.points}
                  onChange={(e) =>
                    update((previous) => ({
                      ...previous,
                      points: Math.max(
                        0,
                        Math.min(
                          Math.floor(Number(e.target.value) || 0),
                          previous.customer?.points ?? 0,
                          Math.floor(totals.subtotal * 10),
                        ),
                      ),
                    }))
                  }
                />
                <button
                  className="pos-button"
                  style={{ marginTop: 12 }}
                  onClick={() =>
                    update((previous) => ({
                      ...previous,
                      points: Math.min(
                        previous.customer?.points ?? 0,
                        Math.floor(totals.subtotal * 10),
                      ),
                    }))
                  }
                >
                  Use maximum
                </button>
              </>
            ) : (
              <p className="pos-muted">
                Scan the customer’s Jayds account QR to earn or redeem points.
              </p>
            )}
            {!draft.customer && (
              <div style={{ marginTop: 16 }}>
                <label htmlFor="account-qr">Account QR code</label>
                <input
                  id="account-qr"
                  className="pos-field"
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value)}
                  placeholder="account:…"
                  autoComplete="off"
                />
                <button
                  className="pos-button"
                  disabled={!online || busy || !accountCode}
                  style={{ marginTop: 12 }}
                  onClick={() => void lookup(accountCode)}
                >
                  Link account
                </button>
                {error && (
                  <p className="pos-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
          <footer className="pos-dialog-footer">
            {draft.customer && (
              <button
                className="pos-button"
                onClick={() =>
                  update((previous) => ({
                    ...previous,
                    customer: null,
                    points: 0,
                  }))
                }
              >
                Unlink
              </button>
            )}
            <button
              className="pos-button"
              onClick={() => {
                setPanel(null);
                setScanner(true);
              }}
            >
              <PosIcon name="scan" />
              Scan account
            </button>
            <button
              className="pos-button pos-primary"
              onClick={() => setPanel(null)}
            >
              Done
            </button>
          </footer>
        </PosDialog>
      )}
      {scanner && (
        <QRScanner
          title="Scan customer account"
          onScan={(qr) => void lookup(qr)}
          onClose={() => setScanner(false)}
          onManualEntry={() => {
            setScanner(false);
            setPanel("loyalty");
          }}
        />
      )}
    </PosShell>
  );
}
