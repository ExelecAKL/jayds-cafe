"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import {
  InvoiceDocument,
  type InvoiceRecord,
} from "@cafeos/shared/finance/invoice";
import { estimateOsdIncomeTax } from "@cafeos/shared/finance/calculations";
import { manilaDate } from "@cafeos/shared/customer/scheduling";
import { PageHeader, Drawer, Feedback, LoadingRows, peso } from "./Operations";
import { notifyAdmin } from "./AdminToasts";
import { withRequestDeadline } from "@cafeos/shared/utils/request";
import {
  uploadFinanceDocument,
  downloadFinanceDocument,
} from "../lib/finance-documents";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
interface Settings {
  registered_name: string;
  trade_name: string;
  tin: string;
  branch_code: string;
  registered_address: string;
  invoices_enabled: boolean;
  authority_basis: string;
  invoice_prefix: string;
  next_invoice: number;
  compliance_verified: boolean;
  authorization_reference: string | null;
  authorization_date: string | null;
  registered_serial_start: number | null;
  registered_serial_end: number | null;
  delivery_tax_treatment: "pending" | "pass_through" | "vat_inclusive";
  other_taxable_income: number;
  income_tax_credits: number;
  income_setup_confirmed: boolean;
  tax_year: number;
}
interface Expense {
  id: string;
  business_date: string;
  description: string;
  category: string;
  gross_centavos: number;
  input_vat_centavos: number;
  reversed: boolean;
  document_reference: string | null;
  document_id?: string | null;
}
interface Report {
  net_sales: number;
  output_vat: number;
  collections: number;
  delivery: number;
  delivery_income: number;
  delivery_tax_pending: number;
  cogs: number;
  operating_expenses: number;
  input_vat: number;
  purchase_input_vat: number;
  stock_writeoffs: number;
  stock_writeoff_cost_unknown: number;
  vat_balance: number;
  inventory_value: number;
  purchases: PurchaseReceipt[];
  operating_profit: number;
  historical_tax_unknown: number;
  historical_cost_unknown: number;
  pending_invoices: number;
  unconsumed_paid_orders: number;
  settings: Settings;
  ytd_osd_gross_sales: number;
  ytd_historical_tax_unknown: number;
  ytd_delivery_tax_pending: number;
  daily: { business_date: string; net_sales: number; vat: number }[];
  invoices: InvoiceRecord[];
  expenses: Expense[];
}
interface PurchaseReceipt {
  id: string;
  reference: string;
  created_at: string;
  purchase_number: string | null;
  supplier: string | null;
  gross_centavos: number;
  vat_review: {
    id: string;
    input_vat_centavos: number;
    document_id: string;
    document_reference: string;
    reversed: boolean;
  } | null;
}
const cents = (value: number) => peso(value / 100);
export default function FinanceWorkspace() {
  const { user, initialized } = useAuth();
  if (!initialized) return <p role="status">Loading account…</p>;
  return <FinanceSession key={user?.id ?? "guest"} />;
}
function FinanceSession() {
  const today = manilaDate(new Date());
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [tab, setTab] = useState("overview"),
    [drawer, setDrawer] = useState<"expense" | "settings" | null>(null),
    [invoice, setInvoice] = useState<InvoiceRecord | null>(null),
    [reverse, setReverse] = useState<Expense | null>(null),
    [purchaseReview, setPurchaseReview] = useState<PurchaseReceipt | null>(
      null,
    ),
    [reversePurchase, setReversePurchase] = useState<PurchaseReceipt | null>(
      null,
    ),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const reportPeriod = useRef("");
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    if (reportPeriod.current !== from + ":" + to) setReport(null);
    try {
      const { data, error: failure } = await withRequestDeadline((signal) =>
        supabase
          .rpc("finance_report", {
            p_from: from,
            p_to: to,
          })
          .abortSignal(signal),
      );
      if (request !== generation.current) return;
      if (failure) {
        throw new Error(
          failure.code === "PGRST202"
            ? "The finance database update must be applied before using invoices and reports."
            : failure.message,
        );
      } else {
        reportPeriod.current = from + ":" + to;
        setReport(data as Report);
      }
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Finance records could not load. Try again.",
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [load]);
  const run = async (name: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const { error: failure } = await withRequestDeadline((signal) =>
        supabase.rpc(name, args).abortSignal(signal),
      );
      if (failure) throw new Error(failure.message);
      notifyAdmin("Saved successfully.", "success");
      setDrawer(null);
      setReverse(null);
      setPurchaseReview(null);
      setReversePurchase(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  };
  const settings = report?.settings;
  const estimate =
    report && settings && settings.tax_year === Number(to.slice(0, 4))
      ? estimateOsdIncomeTax(
          report.ytd_osd_gross_sales / 100,
          Number(settings.other_taxable_income),
          Number(settings.income_tax_credits),
        )
      : null;
  return (
    <div className="ops-page">
      <PageHeader
        eyebrow="Finance"
        title="Sales, costs & invoices"
        description="VAT-inclusive sales and recorded business costs. Report dates use Philippine time."
      >
        <button
          className="ops-button"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </button>
        <button
          className="ops-button primary"
          disabled={!settings}
          onClick={() => setDrawer("settings")}
        >
          Invoice & tax setup
        </button>
      </PageHeader>
      <Feedback error={error} />
      <div className="ops-toolbar">
        <label>
          From <FieldRequirement required />
          <input
            type="date"
            required
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To <FieldRequirement required />
          <input
            type="date"
            required
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <nav className="ops-tabs" aria-label="Finance views">
        {["overview", "expenses", "purchase VAT", "invoices"].map((view) => (
          <button
            key={view}
            aria-current={tab === view ? "page" : undefined}
            className={tab === view ? "active" : ""}
            onClick={() => setTab(view)}
          >
            {view[0].toUpperCase() + view.slice(1)}
          </button>
        ))}
      </nav>
      {loading && <LoadingRows label="Loading finance records…" />}
      {Number(report?.pending_invoices) > 0 && (
        <p role="status" className="ops-feedback">
          {report?.pending_invoices} posted payments await invoice setup or
          numbering review. Open Invoice & tax setup to review the
          configuration.
        </p>
      )}
      {report && tab === "overview" && (
        <>
          {(report.historical_tax_unknown > 0 ||
            report.historical_cost_unknown > 0 ||
            report.unconsumed_paid_orders > 0 ||
            report.delivery_tax_pending > 0) && (
            <div className="ops-feedback" role="status">
              {report.historical_tax_unknown > 0 && (
                <p>
                  {report.historical_tax_unknown} older paid orders have no
                  accepted tax snapshot. Their tax has not been reconstructed.
                </p>
              )}
              {report.historical_cost_unknown > 0 && (
                <p>
                  {report.historical_cost_unknown} older stock consumption
                  records have no recorded unit cost; profit is incomplete for
                  this period.
                </p>
              )}
              {report.unconsumed_paid_orders > 0 && (
                <p>
                  {report.unconsumed_paid_orders} paid orders await stock
                  consumption; their costs are not fully recorded yet.
                </p>
              )}
              {report.delivery_tax_pending > 0 && (
                <p>
                  Delivery tax treatment needs configuration for{" "}
                  {report.delivery_tax_pending} transactions.
                </p>
              )}
            </div>
          )}
          <div className="ops-metrics">
            {[
              ["Net product sales", report.net_sales],
              [
                "Stock used & written off",
                Number(report.cogs) + Number(report.stock_writeoffs ?? 0),
              ],
              ["Operating expenses", report.operating_expenses],
              ["Operating profit", report.operating_profit],
            ].map(([label, value]) => (
              <article className="ops-metric" key={label as string}>
                <span className="ops-metric-label">{label as string}</span>
                <strong
                  className="ops-metric-value"
                  style={{ display: "block" }}
                >
                  {cents(value as number)}
                </strong>
              </article>
            ))}
          </div>
          <details className="ops-panel" style={{ padding: 20, marginTop: 20 }}>
            <summary>Tax & stock breakdown</summary>
            <dl className="ops-metrics" style={{ marginTop: 16 }}>
              {[
                ["Output VAT", report.output_vat],
                ["Reviewed input VAT", report.input_vat],
                ["Purchase input VAT", report.purchase_input_vat ?? 0],
                [
                  "VAT balance",
                  report.vat_balance ?? report.output_vat - report.input_vat,
                ],
                ["Consumed stock cost", report.cogs],
                ["Stock write-offs", report.stock_writeoffs ?? 0],
                ["Stock value on hand", report.inventory_value ?? 0],
                ["Net delivery income", report.delivery_income],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>{cents(Number(value))}</dd>
                </div>
              ))}
            </dl>
            {Number(report.stock_writeoff_cost_unknown) > 0 && (
              <p role="status">
                {report.stock_writeoff_cost_unknown} older stock write-offs have
                no recorded cost.
              </p>
            )}
          </details>
          <section className="ops-panel" style={{ padding: 20, marginTop: 20 }}>
            <h2>Daily net product sales</h2>
            {report.daily.length ? (
              <>
                <div style={{ height: 240 }} aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={report.daily.map((d) => ({
                        ...d,
                        sales: Number(d.net_sales) / 100,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="business_date" />
                      <YAxis unit="₱" />
                      <Tooltip />
                      <Bar
                        isAnimationActive={false}
                        dataKey="sales"
                        fill="#755237"
                        name="Net sales (PHP)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="ops-table-wrap">
                  <table className="ops-table">
                    <caption>Daily amounts in Philippine pesos</caption>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Net sales</th>
                        <th>Included VAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.daily.map((d) => (
                        <tr key={d.business_date}>
                          <td>{d.business_date}</td>
                          <td>{cents(d.net_sales)}</td>
                          <td>{cents(d.vat)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>No posted sales in this period.</p>
            )}
          </section>
          <section className="ops-panel" style={{ padding: 20, marginTop: 20 }}>
            <h2>Income tax estimate · {to.slice(0, 4)} year to date</h2>
            <p>
              Individual 40% OSD uses gross sales. Actual costs determine
              business profit and are not deducted again for this estimate.
            </p>
            {estimate &&
            settings?.income_setup_confirmed &&
            !report.ytd_historical_tax_unknown &&
            !report.ytd_delivery_tax_pending ? (
              <dl className="ops-metrics">
                {[
                  ["OSD gross sales", estimate.gross_sales],
                  ["40% deduction", estimate.osd],
                  ["Taxable income", estimate.taxable_income],
                  ["Estimated income tax", estimate.tax_due],
                  ["Recorded credits/payments", estimate.credits],
                  ["Estimated balance", estimate.balance],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt>{label as string}</dt>
                    <dd>{cents(value as number)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p role="status">
                Confirm the tax year, owner’s other taxable income and credits
                in setup. Historical sales without accepted tax data and pending
                delivery tax treatment must also be reconciled before a
                year-to-date estimate is complete.
              </p>
            )}
          </section>
        </>
      )}
      {report && tab === "expenses" && (
        <section className="ops-panel" style={{ padding: 20 }}>
          <div className="ops-toolbar">
            <h2>Operating expenses</h2>
            <button
              className="ops-button primary"
              onClick={() => setDrawer("expense")}
            >
              Add expense
            </button>
          </div>
          <p>
            Stock purchases belong in Buy & receive stock. Record them there
            once; their cost is recognized on consumption.
          </p>
          <p>
            Latest 100 records in the selected period. All posted records are
            included in report totals.
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense</th>
                  <th>Amount</th>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {report.expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.business_date}</td>
                    <td>
                      {e.description}
                      <small>{e.category}</small>
                    </td>
                    <td>{cents(e.gross_centavos)}</td>
                    <td>
                      {e.document_reference || "—"}
                      {e.document_id && (
                        <button
                          className="ops-button small"
                          onClick={() =>
                            void downloadFinanceDocument(e.document_id!).catch(
                              (cause) => notifyAdmin(cause.message, "error"),
                            )
                          }
                        >
                          Download invoice photo
                        </button>
                      )}
                    </td>
                    <td>{e.reversed ? "Reversed" : "Posted"}</td>
                    <td>
                      <button
                        className="ops-button"
                        disabled={e.reversed}
                        onClick={() => {
                          setReason("");
                          setReverse(e);
                        }}
                      >
                        Reverse
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.expenses.length && (
            <p>No expenses recorded for this period.</p>
          )}
        </section>
      )}
      {report && tab === "invoices" && (
        <section className="ops-panel" style={{ padding: 20 }}>
          <h2>Invoices & credit notes</h2>
          <p>
            {settings?.invoices_enabled
              ? "Invoice generation is enabled."
              : "Invoice generation is paused."}{" "}
            {settings?.compliance_verified
              ? "Configured registered serial numbering."
              : "Numbers are system-generated. Owner-reported RDO confirmation is recorded in setup."}
          </p>
          <p>Latest 100 documents in the selected period.</p>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Issued</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {report.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.number}</td>
                    <td>{manilaDate(new Date(i.issued_at))}</td>
                    <td>{i.kind === "invoice" ? "Invoice" : "Credit note"}</td>
                    <td>{cents(i.breakdown.total)}</td>
                    <td>
                      <button
                        className="ops-button"
                        onClick={() => setInvoice(i)}
                      >
                        View / Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.invoices.length && (
            <p>
              Invoices appear after valid confirmed payments and registered
              identity setup.
            </p>
          )}
        </section>
      )}
      {report && tab === "purchase VAT" && (
        <section className="ops-panel" style={{ padding: 20 }}>
          <h2>Supplier invoice review</h2>
          <p>
            Review the invoice after receiving stock. Creditable VAT reduces
            stock cost; the purchase is not posted again as an operating
            expense.
          </p>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Delivery / supplier</th>
                  <th>Received cost</th>
                  <th>Input VAT</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(report.purchases ?? []).map((receipt) => (
                  <tr key={receipt.id}>
                    <td>{manilaDate(new Date(receipt.created_at))}</td>
                    <td>
                      {receipt.reference}
                      <small>
                        {receipt.supplier || "Supplier not recorded"} ·{" "}
                        {receipt.purchase_number || "Direct receipt"}
                      </small>
                    </td>
                    <td>{cents(receipt.gross_centavos)}</td>
                    <td>
                      {receipt.vat_review && !receipt.vat_review.reversed
                        ? cents(receipt.vat_review.input_vat_centavos)
                        : receipt.vat_review
                          ? "Reversed"
                          : "Not reviewed"}
                    </td>
                    <td>
                      {receipt.vat_review && !receipt.vat_review.reversed ? (
                        <>
                          <button
                            className="ops-button small"
                            onClick={() =>
                              void downloadFinanceDocument(
                                receipt.vat_review!.document_id,
                              ).catch((cause) =>
                                notifyAdmin(cause.message, "error"),
                              )
                            }
                          >
                            Download invoice photo
                          </button>
                          <button
                            className="ops-button small"
                            onClick={() => {
                              setReason("");
                              setReversePurchase(receipt);
                            }}
                          >
                            Reverse VAT review
                          </button>
                        </>
                      ) : (
                        <button
                          className="ops-button"
                          disabled={Number(receipt.gross_centavos) <= 0}
                          onClick={() => setPurchaseReview(receipt)}
                        >
                          Review VAT
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.purchases?.length && (
            <p>No deliveries received in this period.</p>
          )}
        </section>
      )}
      {purchaseReview && (
        <Drawer
          title="Review supplier invoice"
          busy={busy}
          onClose={() => setPurchaseReview(null)}
        >
          <PurchaseVatForm
            receipt={purchaseReview}
            busy={busy}
            onSubmit={(entry) =>
              run("finance_review_purchase_vat", { p_entry: entry })
            }
          />
          <Feedback error={error} />
        </Drawer>
      )}
      {reversePurchase && (
        <Drawer
          title="Reverse VAT review"
          busy={busy}
          onClose={() => setReversePurchase(null)}
        >
          <form
            className="ops-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run("finance_reverse_purchase_vat", {
                p_entry: reversePurchase.vat_review!.id,
                p_reason: reason,
              });
            }}
          >
            <p>
              {reversePurchase.reference} ·{" "}
              {cents(reversePurchase.vat_review!.input_vat_centavos)}
            </p>
            <label>
              Reason <FieldRequirement required />
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button className="ops-button primary" disabled={busy}>
              Confirm reversal
            </button>
          </form>
          <Feedback error={error} />
        </Drawer>
      )}
      {drawer === "expense" && (
        <Drawer
          title="Add operating expense"
          onClose={() => setDrawer(null)}
          busy={busy}
        >
          <ExpenseForm
            busy={busy}
            onSubmit={(expense) =>
              run("finance_post_expense", { p_expense: expense })
            }
          />
          <Feedback error={error} />
        </Drawer>
      )}
      {drawer === "settings" && settings && (
        <Drawer
          title="Invoice & tax setup"
          onClose={() => setDrawer(null)}
          busy={busy}
        >
          <SettingsForm
            settings={settings}
            busy={busy}
            onSubmit={(value) =>
              void run("finance_save_settings", { p_settings: value })
            }
          />
          <Feedback error={error} />
        </Drawer>
      )}
      {reverse && (
        <Drawer
          title="Reverse this expense?"
          description="The original entry stays in the history. A linked reversal adjusts the current business date."
          busy={busy}
          onClose={() => setReverse(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("finance_reverse_expense", {
                p_expense: reverse.id,
                p_reason: reason,
              });
            }}
          >
            <p>
              {reverse.description} · {cents(reverse.gross_centavos)}
            </p>
            <label>
              Reason <FieldRequirement required />
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="ops-button primary" disabled={busy}>
              Confirm reversal
            </button>
          </form>
          <Feedback error={error} />
        </Drawer>
      )}
      {invoice && (
        <Drawer
          title={invoice.kind === "invoice" ? "Invoice" : "Credit note"}
          wide
          onClose={() => setInvoice(null)}
        >
          <button
            className="ops-button print:hidden"
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>
          <InvoiceDocument invoice={invoice} />
        </Drawer>
      )}
    </div>
  );
}
function ExpenseForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (value: Record<string, unknown>) => Promise<void>;
}) {
  const [inputVat, setInputVat] = useState(0);
  const [file, setFile] = useState<File | null>(null),
    [documentId, setDocumentId] = useState<string | null>(null),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  const lock = useRef(false);
  const requestKey = useRef(crypto.randomUUID());
  return (
    <form
      className="ops-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current || busy) return;
        const f = new FormData(event.currentTarget);
        lock.current = true;
        setUploading(true);
        setUploadError("");
        try {
          const uploaded =
            documentId || (file ? await uploadFinanceDocument(file) : null);
          setDocumentId(uploaded);
          await onSubmit({
            request_key: requestKey.current,
            business_date: f.get("business_date"),
            category: f.get("category"),
            description: f.get("description"),
            amount: Number(f.get("amount")),
            input_vat: inputVat,
            input_vat_reviewed: f.has("reviewed"),
            document_reference: f.get("document"),
            document_id: uploaded,
          });
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : "Invoice photo could not upload.";
          setUploadError(message);
          notifyAdmin(message, "error");
        } finally {
          lock.current = false;
          setUploading(false);
        }
      }}
    >
      <label>
        Business date <FieldRequirement required />
        <input
          name="business_date"
          type="date"
          required
          defaultValue={manilaDate(new Date())}
        />
      </label>
      <label>
        Category <FieldRequirement required />
        <select name="category" required>
          {["rent", "utilities", "wages", "transport", "supplies", "other"].map(
            (c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Description <FieldRequirement required />
        <input name="description" required minLength={3} maxLength={500} />
      </label>
      <label>
        Total paid (PHP) <FieldRequirement required />
        <input name="amount" type="number" min="0.01" step="0.01" required />
      </label>
      <label>
        Creditable input VAT (PHP) <FieldRequirement required={false} />
        <input
          type="number"
          min="0"
          step="0.01"
          value={inputVat}
          onChange={(e) => setInputVat(Number(e.target.value))}
        />
      </label>
      <label>
        Supporting invoice/document reference{" "}
        <FieldRequirement required={inputVat > 0} />
        <input
          name="document"
          required={inputVat > 0}
          minLength={inputVat > 0 ? 3 : undefined}
          maxLength={300}
        />
      </label>
      <label>
        <input type="checkbox" name="reviewed" required={inputVat > 0} /> I
        reviewed the supporting invoice and confirmed this input VAT is
        creditable{inputVat > 0 && <FieldRequirement required />}
      </label>
      <label>
        Invoice photo <FieldRequirement required={inputVat > 0} />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required={inputVat > 0 && !documentId}
          disabled={busy || uploading}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setDocumentId(null);
          }}
        />
        <small>JPG, PNG or still WebP · up to 5 MB · private to Admin</small>
      </label>
      <Feedback error={uploadError} />
      <button className="ops-button primary" disabled={busy || uploading}>
        {busy || uploading ? "Saving…" : "Post expense"}
      </button>
    </form>
  );
}
function PurchaseVatForm({
  receipt,
  busy,
  onSubmit,
}: {
  receipt: PurchaseReceipt;
  busy: boolean;
  onSubmit: (value: Record<string, unknown>) => Promise<void>;
}) {
  const key = useRef(crypto.randomUUID()),
    lock = useRef(false);
  const [file, setFile] = useState<File | null>(null),
    [documentId, setDocumentId] = useState<string | null>(null),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="ops-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current || busy) return;
        const form = new FormData(event.currentTarget);
        lock.current = true;
        setUploading(true);
        setError("");
        try {
          const uploaded =
            documentId || (file ? await uploadFinanceDocument(file) : null);
          if (!uploaded) throw new Error("Choose the supplier invoice photo.");
          setDocumentId(uploaded);
          await onSubmit({
            request_key: key.current,
            receipt_id: receipt.id,
            input_vat: Number(form.get("vat")),
            document_reference: form.get("reference"),
            document_id: uploaded,
            reviewed: form.has("reviewed"),
          });
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : "The invoice photo could not upload.";
          setError(message);
          notifyAdmin(message, "error");
        } finally {
          lock.current = false;
          setUploading(false);
        }
      }}
    >
      <p>
        {receipt.reference} · {receipt.supplier || "Supplier not recorded"}
      </p>
      <p>
        Received stock cost: <strong>{cents(receipt.gross_centavos)}</strong>
      </p>
      <label>
        Creditable input VAT (PHP) <FieldRequirement required />
        <input
          name="vat"
          type="number"
          min="0.01"
          step="0.01"
          max={Math.round((Number(receipt.gross_centavos) * 12) / 112) / 100}
          required
        />
      </label>
      <label>
        Supplier invoice reference <FieldRequirement required />
        <input name="reference" minLength={3} maxLength={300} required />
      </label>
      <label>
        Invoice photo <FieldRequirement required />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required={!documentId}
          disabled={busy || uploading}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setDocumentId(null);
          }}
        />
        <small>JPG, PNG or still WebP · up to 5 MB · private to Admin</small>
      </label>
      <label>
        <input type="checkbox" name="reviewed" required /> I reviewed this
        supplier invoice and confirmed the input VAT is creditable.{" "}
        <FieldRequirement required />
      </label>
      <Feedback error={error} />
      <button className="ops-button primary" disabled={busy || uploading}>
        {busy || uploading ? "Saving…" : "Post VAT review"}
      </button>
    </form>
  );
}
function SettingsForm({
  settings: s,
  busy,
  onSubmit,
}: {
  settings: Settings;
  busy: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="ops-form"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        onSubmit({
          ...s,
          ...Object.fromEntries(f),
          invoices_enabled: f.has("invoices_enabled"),
          income_setup_confirmed: f.has("income_setup_confirmed"),
          other_taxable_income: Number(f.get("other_taxable_income")),
          income_tax_credits: Number(f.get("income_tax_credits")),
          tax_year: Number(f.get("tax_year")),
        });
      }}
    >
      <p>
        Registered identity appears on issued invoices. Existing issued
        documents keep their original details.
      </p>
      {(
        [
          ["registered_name", "Registered taxpayer name"],
          ["trade_name", "Trade name"],
          ["tin", "TIN"],
          ["branch_code", "Branch code"],
          ["registered_address", "Registered address"],
          ["invoice_prefix", "System invoice prefix"],
          ["authority_basis", "Invoice authority / owner confirmation"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label} <FieldRequirement required />
          <input
            name={key}
            defaultValue={s[key]}
            required
            maxLength={key === "registered_address" ? 500 : 300}
            pattern={
              key === "tin"
                ? "[0-9]{3}-?[0-9]{3}-?[0-9]{3}"
                : key === "branch_code"
                  ? "[0-9]{5}"
                  : key === "invoice_prefix"
                    ? "[A-Z0-9-]{2,16}"
                    : undefined
            }
          />
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          name="invoices_enabled"
          defaultChecked={s.invoices_enabled}
        />{" "}
        Enable invoices
      </label>
      <p>
        Next system invoice: {s.invoice_prefix}-
        {String(s.next_invoice).padStart(8, "0")}.{" "}
        {s.compliance_verified
          ? "Registered numbering configured."
          : "Registered serial authorization has not been independently verified."}
      </p>
      <label>
        Delivery tax treatment <FieldRequirement required />
        <select
          name="delivery_tax_treatment"
          defaultValue={s.delivery_tax_treatment}
        >
          <option value="pending">
            Pending operator/accountant confirmation
          </option>
          <option value="pass_through">Pass-through delivery charge</option>
          <option value="vat_inclusive">VAT-inclusive delivery charge</option>
        </select>
      </label>
      <h3>Individual income tax · 40% OSD</h3>
      <label>
        Tax year <FieldRequirement required />
        <input
          name="tax_year"
          type="number"
          min="2023"
          max="2100"
          required
          defaultValue={s.tax_year}
        />
      </label>
      <label>
        Other owner taxable income for this year (PHP){" "}
        <FieldRequirement required />
        <input
          name="other_taxable_income"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={s.other_taxable_income}
        />
      </label>
      <label>
        Income tax credits and payments (PHP) <FieldRequirement required />
        <input
          name="income_tax_credits"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={s.income_tax_credits}
        />
      </label>
      <label>
        <input
          type="checkbox"
          name="income_setup_confirmed"
          defaultChecked={s.income_setup_confirmed}
        />{" "}
        I confirmed this year’s OSD election, other taxable income and credits
      </label>
      <button className="ops-button primary" disabled={busy}>
        {busy ? "Saving…" : "Save setup"}
      </button>
    </form>
  );
}
