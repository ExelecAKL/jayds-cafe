"use client";
import { createUuid } from "@cafeos/shared/utils/uuid";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@cafeos/shared/supabase/client";
import type { Supplier, PurchaseOrder } from "@cafeos/shared/inventory/types";
import {
  Badge,
  businessDate,
  Drawer,
  Empty,
  Feedback,
  Icon,
  PageHeader,
  peso,
  quantity,
  useOperations,
} from "./Operations";
import { PaginatedTable } from "./PaginatedTable";
function SupplierForm({
  supplier,
  onClose,
}: {
  supplier: Supplier | null;
  onClose: () => void;
}) {
  const ops = useOperations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    contact_name: supplier?.contact_name ?? "",
    email: supplier?.email ?? "",
    phone: supplier?.phone ?? "",
    lead_time_days: supplier?.lead_time_days ?? 3,
    notes: supplier?.notes ?? "",
    is_active: supplier?.is_active ?? true,
  });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = supplier
        ? await supabase.from("suppliers").update(form).eq("id", supplier.id)
        : await supabase.from("suppliers").insert(form);
      if (result.error) throw new Error(result.error.message);
      await ops.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={supplier ? "Edit supplier" : "Add supplier"}
      onClose={onClose}
      busy={busy}
    >
      <Feedback error={error} />
      <form className="ops-form" onSubmit={save}>
        <label>
          Supplier name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Contact person
          <input
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
          />
        </label>
        <div className="ops-form-grid">
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
        </div>
        <label>
          Default lead time (days)
          <input
            type="number"
            min="0"
            step="1"
            required
            value={form.lead_time_days}
            onChange={(e) =>
              setForm({ ...form, lead_time_days: Number(e.target.value) })
            }
          />
          <small>Stock items can override this lead time in Inventory.</small>
        </label>
        <label>
          Notes
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <label className="ops-check-label">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Active supplier
        </label>
        <div className="ops-form-actions">
          <button
            type="button"
            className="ops-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="ops-button primary" disabled={busy}>
            {busy ? "Saving…" : "Save supplier"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
function PurchaseForm({
  purchase,
  onClose,
}: {
  purchase: PurchaseOrder | null;
  onClose: () => void;
}) {
  const ops = useOperations();
  const [supplier, setSupplier] = useState(purchase?.supplier_id ?? "");
  const [expected, setExpected] = useState(purchase?.expected_on ?? "");
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const [lines, setLines] = useState(
    (purchase?.lines ?? []).map((l) => ({
      ingredient_id: l.ingredient_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (
        !supplier ||
        !lines.length ||
        lines.some(
          (l) =>
            !l.ingredient_id ||
            !Number.isFinite(l.quantity) ||
            l.quantity <= 0 ||
            !Number.isFinite(l.unit_cost) ||
            l.unit_cost < 0,
        )
      )
        throw new Error(
          "Choose a supplier and add valid purchase quantities and costs.",
        );
      if (new Set(lines.map((l) => l.ingredient_id)).size !== lines.length)
        throw new Error("Combine duplicate stock items into one line.");
      await ops.run("inv_save_po", {
        p_id: purchase?.id ?? null,
        p_supplier: supplier,
        p_expected: expected || null,
        p_notes: notes,
        p_lines: lines,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={purchase ? "Edit " + purchase.number : "New purchase draft"}
      description="Drafts require approval and a separate physical receiving confirmation."
      onClose={onClose}
      busy={busy}
      wide
    >
      <Feedback error={error} />
      <form className="ops-form" onSubmit={save}>
        <div className="ops-form-grid">
          <label>
            Supplier
            <select
              required
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            >
              <option value="">Choose supplier</option>
              {ops.suppliers
                .filter((s) => s.is_active || s.id === supplier)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Expected delivery
            <input
              type="date"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
          </label>
        </div>
        {lines.map((line, index) => {
          const stock = ops.stock.find((s) => s.id === line.ingredient_id);
          return (
            <div className="ops-recipe-line" key={index}>
              <label>
                Stock item
                <select
                  required
                  value={line.ingredient_id}
                  onChange={(e) => {
                    const s = ops.stock.find((s) => s.id === e.target.value);
                    setLines(
                      lines.map((l, i) =>
                        i === index
                          ? {
                              ingredient_id: e.target.value,
                              quantity:
                                (s?.pack_size ?? 1) *
                                (s?.min_purchase_packs ?? 1),
                              unit_cost: s?.cost_per_unit ?? 0,
                            }
                          : l,
                      ),
                    );
                  }}
                >
                  <option value="">Choose item</option>
                  {ops.stock
                    .filter((s) => s.is_active || s.id === line.ingredient_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.supplier_id === supplier ? " · Preferred" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <div className="ops-form-grid">
                <label>
                  Purchasing packs
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={line.quantity / (stock?.pack_size ?? 1)}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index
                            ? {
                                ...l,
                                quantity:
                                  Number(e.target.value) *
                                  (stock?.pack_size ?? 1),
                              }
                            : l,
                        ),
                      )
                    }
                  />
                  <small>
                    {quantity(stock?.pack_size ?? 1)} {stock?.unit} per pack ·{" "}
                    {quantity(line.quantity)} base units
                  </small>
                </label>
                <label>
                  Cost per base unit (PHP)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.unit_cost}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index
                            ? { ...l, unit_cost: Number(e.target.value) }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="ops-button"
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="ops-button"
          onClick={() =>
            setLines([
              ...lines,
              { ingredient_id: "", quantity: 1, unit_cost: 0 },
            ])
          }
        >
          Add purchase item
        </button>
        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="ops-form-summary">
          Estimated total:{" "}
          <strong>
            {peso(lines.reduce((sum, l) => sum + l.quantity * l.unit_cost, 0))}
          </strong>
          {purchase?.generated && (
            <p>
              Saving marks this draft as manually edited and protects it from
              automatic updates.
            </p>
          )}
        </div>
        <div className="ops-form-actions">
          <button
            type="button"
            className="ops-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="ops-button primary" disabled={busy}>
            {busy ? "Saving…" : "Save draft"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
function ReceiveForm({
  purchase,
  onClose,
}: {
  purchase: PurchaseOrder;
  onClose: () => void;
}) {
  const ops = useOperations();
  const [reference, setReference] = useState("");
  const [key] = useState(() => createUuid());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState(
    (purchase.lines ?? [])
      .filter((l) => l.received_quantity < l.quantity)
      .map((l) => ({
        ingredient_id: l.ingredient_id,
        quantity: 0,
        unit_cost: l.unit_cost,
        batch_code: "",
        expires_on: "",
        outstanding: l.quantity - l.received_quantity,
      })),
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const received = lines.filter((l) => l.quantity > 0);
      if (
        !reference.trim() ||
        !received.length ||
        lines.some(
          (l) =>
            !Number.isFinite(l.quantity) ||
            l.quantity < 0 ||
            l.quantity > l.outstanding ||
            !Number.isFinite(l.unit_cost) ||
            l.unit_cost < 0,
        )
      )
        throw new Error(
          "Enter a delivery reference and actual quantities within the outstanding order.",
        );
      await ops.run("inv_receive_po", {
        p_id: purchase.id,
        p_reference: reference.trim(),
        p_lines: received.map((l) => ({
          ingredient_id: l.ingredient_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_code: l.batch_code || null,
          expires_on: l.expires_on || null,
        })),
        p_key: key,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Receiving failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={"Receive " + purchase.number}
      description="Confirm quantities physically delivered. Unreceived quantities remain outstanding."
      onClose={onClose}
      busy={busy}
      wide
    >
      <Feedback error={error} />
      <form className="ops-form" onSubmit={save}>
        <label>
          Delivery / invoice reference
          <input
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        {lines.map((line, index) => {
          const stock = ops.stock.find((s) => s.id === line.ingredient_id);
          return (
            <div key={line.ingredient_id} className="ops-recipe-line">
              <h3>{stock?.name ?? "Stock item"}</h3>
              <p className="ops-description">
                Outstanding: {quantity(line.outstanding)} {stock?.unit}
              </p>
              <div className="ops-form-grid">
                <label>
                  Actual quantity ({stock?.unit})
                  <input
                    type="number"
                    min="0"
                    max={line.outstanding}
                    step="any"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index
                            ? { ...l, quantity: Number(e.target.value) }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Actual cost / base unit
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.unit_cost}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index
                            ? { ...l, unit_cost: Number(e.target.value) }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Batch / lot
                  <input
                    value={line.batch_code}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index
                            ? { ...l, batch_code: e.target.value }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Expiry (optional)
                  <input
                    type="date"
                    value={line.expires_on}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index
                            ? { ...l, expires_on: e.target.value }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            </div>
          );
        })}
        <div className="ops-form-actions">
          <button
            type="button"
            className="ops-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="ops-button primary" disabled={busy}>
            {busy ? "Posting…" : "Confirm physical receipt"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
export function PurchasingWorkspace() {
  const ops = useOperations();
  const params = useSearchParams();
  const [tab, setTab] = useState("orders");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(params.get("filter") ?? "open");
  const [supplier, setSupplier] = useState<Supplier | null | undefined>();
  const [draft, setDraft] = useState<PurchaseOrder | null | undefined>();
  const [selectedSnapshot, setSelected] = useState<PurchaseOrder | null>(null);
  const selected =
    ops.purchases.find((p) => p.id === selectedSnapshot?.id) ??
    selectedSnapshot;
  const [receive, setReceive] = useState<PurchaseOrder | null>(null);
  const [transition, setTransition] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const act = async () => {
    if (!selected || !transition) return;
    setBusy(true);
    setError("");
    try {
      await ops.run("inv_po_transition", {
        p_id: selected.id,
        p_status: transition,
      });
      setSelected(null);
      setTransition(null);
      setSuccess("Purchase order updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };
  const orders = ops.purchases.filter(
    (p) =>
      (p.number + p.supplier?.name)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "open" && !["received", "cancelled"].includes(p.status)) ||
        (filter === "incoming" &&
          ["approved", "ordered", "partial"].includes(p.status)) ||
        filter === p.status),
  );
  return (
    <>
      <PageHeader
        eyebrow="Supply & replenishment"
        title="Purchasing"
        description="Plan the next delivery. Approve with confidence. Receive what arrived."
      >
        <button className="ops-button" onClick={() => setSupplier(null)}>
          <Icon name="plus" />
          Supplier
        </button>
        <button
          className="ops-button primary"
          disabled={!!ops.error}
          onClick={() => setDraft(null)}
        >
          <Icon name="plus" />
          Purchase draft
        </button>
      </PageHeader>
      <Feedback error={ops.error || error} success={success} />
      <div className="ops-metrics">
        <div className="ops-metric">
          <span>Drafts to review</span>
          <strong>
            {ops.purchases.filter((p) => p.status === "draft").length}
          </strong>
          <small>Administrator approval required</small>
        </div>
        <div className="ops-metric">
          <span>Incoming deliveries</span>
          <strong>
            {
              ops.purchases.filter((p) =>
                ["ordered", "partial"].includes(p.status),
              ).length
            }
          </strong>
          <small>Physically unreceived</small>
        </div>
        <div className="ops-metric">
          <span>Committed purchasing</span>
          <strong>
            {peso(
              ops.purchases
                .filter((p) =>
                  ["approved", "ordered", "partial"].includes(p.status),
                )
                .reduce(
                  (sum, p) =>
                    sum +
                    (p.lines ?? []).reduce(
                      (value, l) =>
                        value +
                        (l.quantity - l.received_quantity) * l.unit_cost,
                      0,
                    ),
                  0,
                ),
            )}
          </strong>
          <small>Outstanding quantities</small>
        </div>
        <div className="ops-metric">
          <span>Active suppliers</span>
          <strong>{ops.suppliers.filter((s) => s.is_active).length}</strong>
          <small>Preferred items set in Inventory</small>
        </div>
      </div>
      <div className="ops-tabs">
        {[
          ["orders", "Purchase orders"],
          ["suppliers", "Suppliers"],
          ["receipts", "Receiving history"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setSearch("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="ops-panel">
        <div className="ops-toolbar">
          <input
            type="search"
            aria-label="Search purchasing"
            placeholder={"Search " + tab + "…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {tab === "orders" && (
            <select
              aria-label="Order status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {[
                "open",
                "all",
                "draft",
                "approved",
                "ordered",
                "partial",
                "received",
                "cancelled",
                "incoming",
              ].map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          )}
        </div>
        {ops.loading ? (
          <p className="ops-loading" role="status">
            Loading purchasing…
          </p>
        ) : tab === "orders" ? (
          <>
            <div className="ops-table-wrap">
              <PaginatedTable
                aria-label="Purchase orders"
                resetKey={JSON.stringify([tab, search, filter])}
                className="ops-table"
              >
                <thead>
                  <tr>
                    <th>Purchase order</th>
                    <th>Supplier</th>
                    <th>Status</th>
                    <th>Expected</th>
                    <th className="numeric">Outstanding value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <button
                          className="ops-text-button"
                          onClick={() => {
                            setSelected(p);
                            setTransition(null);
                          }}
                        >
                          {p.number}
                        </button>
                        <small>
                          {p.generated
                            ? p.manually_edited
                              ? "Generated · manually edited"
                              : "Automatic draft"
                            : "Manual purchase"}
                        </small>
                      </td>
                      <td>{p.supplier?.name}</td>
                      <td>
                        <Badge
                          tone={
                            p.status === "received"
                              ? "success"
                              : p.status === "draft"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td>
                        {p.expected_on
                          ? businessDate(p.expected_on + "T00:00:00+08:00")
                          : "Unscheduled"}
                      </td>
                      <td className="numeric">
                        {peso(
                          (p.lines ?? []).reduce(
                            (sum, l) =>
                              sum +
                              (l.quantity - l.received_quantity) * l.unit_cost,
                            0,
                          ),
                        )}
                      </td>
                      <td>
                        {p.status === "draft" && (
                          <button
                            className="ops-button small"
                            onClick={() => setDraft(p)}
                          >
                            Edit draft
                          </button>
                        )}
                        {["ordered", "partial"].includes(p.status) && (
                          <button
                            className="ops-button small"
                            onClick={() => setReceive(p)}
                          >
                            Receive
                          </button>
                        )}
                        <button
                          className="ops-button small"
                          onClick={() => {
                            setSelected(p);
                            setTransition(null);
                          }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PaginatedTable>
            </div>
            {!orders.length && (
              <Empty
                title="No purchase orders here"
                description="Create a draft manually or refresh forecasts to generate replenishment drafts."
              />
            )}
          </>
        ) : tab === "suppliers" ? (
          <div className="ops-table-wrap">
            <PaginatedTable
              aria-label="Suppliers"
              resetKey={JSON.stringify([tab, search, filter])}
              className="ops-table"
            >
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Contact</th>
                  <th>Lead time</th>
                  <th>Preferred items</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ops.suppliers
                  .filter((s) =>
                    (s.name + s.contact_name)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        <small>{s.email}</small>
                      </td>
                      <td>
                        {s.contact_name || "—"}
                        <small>{s.phone}</small>
                      </td>
                      <td>{s.lead_time_days} days</td>
                      <td>
                        {ops.stock.filter((i) => i.supplier_id === s.id).length}
                      </td>
                      <td>
                        <Badge tone={s.is_active ? "success" : "neutral"}>
                          {s.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="ops-button small"
                          onClick={() => setSupplier(s)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </PaginatedTable>
          </div>
        ) : (
          <div className="ops-table-wrap">
            <PaginatedTable
              aria-label="Goods receipts"
              resetKey={JSON.stringify([tab, search, filter])}
              className="ops-table"
            >
              <thead>
                <tr>
                  <th>Delivery reference</th>
                  <th>Purchase order</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {ops.receipts
                  .filter((r) =>
                    r.reference.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{r.reference}</td>
                      <td>
                        {ops.purchases.find((p) => p.id === r.purchase_order_id)
                          ?.number ?? "Direct receipt"}
                      </td>
                      <td>{businessDate(r.created_at)}</td>
                    </tr>
                  ))}
              </tbody>
            </PaginatedTable>
          </div>
        )}
      </section>
      {supplier !== undefined && (
        <SupplierForm
          supplier={supplier}
          onClose={() => setSupplier(undefined)}
        />
      )}
      {draft !== undefined && (
        <PurchaseForm purchase={draft} onClose={() => setDraft(undefined)} />
      )}
      {receive && (
        <ReceiveForm purchase={receive} onClose={() => setReceive(null)} />
      )}
      {selected && (
        <Drawer
          title={selected.number}
          description={selected.supplier?.name}
          onClose={() => {
            setSelected(null);
            setTransition(null);
          }}
          busy={busy}
        >
          <Feedback error={error} />
          <Badge>{selected.status}</Badge>
          <div className="ops-table-wrap">
            <PaginatedTable
              aria-label="Purchase lines"
              resetKey={selected.id}
              className="ops-table"
            >
              <thead>
                <tr>
                  <th>Stock item</th>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th>Unit cost</th>
                </tr>
              </thead>
              <tbody>
                {(selected.lines ?? []).map((l) => (
                  <tr key={l.id}>
                    <td>
                      {ops.stock.find((s) => s.id === l.ingredient_id)?.name}
                    </td>
                    <td>{quantity(l.quantity)}</td>
                    <td>{quantity(l.received_quantity)}</td>
                    <td>{peso(l.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </PaginatedTable>
          </div>
          {selected.notes && <p>{selected.notes}</p>}
          {transition ? (
            <div className="ops-form-summary">
              <p>
                {transition === "approved"
                  ? "Approve this purchase plan? Stock is added when the delivery is physically received."
                  : transition === "ordered"
                    ? "Confirm that this order was sent to the supplier?"
                    : "Cancel the outstanding purchase? Previously received stock stays in inventory."}
              </p>
              <div className="ops-form-actions">
                <button
                  className="ops-button"
                  disabled={busy}
                  onClick={() => setTransition(null)}
                >
                  Back
                </button>
                <button
                  className="ops-button primary"
                  disabled={busy}
                  onClick={() => void act()}
                >
                  {busy ? "Updating…" : "Confirm " + transition}
                </button>
              </div>
            </div>
          ) : (
            <div className="ops-form-actions">
              {selected.status === "draft" && (
                <button
                  className="ops-button primary"
                  onClick={() => setTransition("approved")}
                >
                  Approve purchase
                </button>
              )}
              {selected.status === "approved" && (
                <button
                  className="ops-button primary"
                  onClick={() => setTransition("ordered")}
                >
                  Confirm ordered
                </button>
              )}
              {!["received", "cancelled"].includes(selected.status) && (
                <button
                  className="ops-button danger"
                  onClick={() => setTransition("cancelled")}
                >
                  Cancel purchase
                </button>
              )}
            </div>
          )}
        </Drawer>
      )}
    </>
  );
}
