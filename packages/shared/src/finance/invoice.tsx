import type { FinancialBreakdown } from "./calculations";
export interface InvoiceRecord {
  id: string;
  order_id: string;
  number: string;
  kind: "invoice" | "credit_note";
  issued_at: string;
  original_invoice: string | null;
  original_number?: string | null;
  business: {
    registered_name: string;
    trade_name: string;
    tin: string;
    branch_code: string;
    address: string;
    numbering: "system_generated" | "registered_serial";
    authority_basis: string;
    authorization_reference: string | null;
    authorization_date: string | null;
    approved_serial_start: number | null;
    approved_serial_end: number | null;
  };
  buyer: { name: string };
  breakdown: FinancialBreakdown;
}
const php = (cents: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    cents / 100,
  );
/** Immutable issued values are displayed without recalculating current menu prices. */
export function InvoiceDocument({ invoice }: { invoice: InvoiceRecord }) {
  const { business: b, breakdown: f } = invoice;
  return (
    <article
      aria-label={invoice.kind === "invoice" ? "Invoice" : "Credit note"}
      className="jayds-invoice"
      style={{
        background: "white",
        color: "#30271f",
        padding: "clamp(16px,4vw,32px)",
        maxWidth: 760,
        margin: "0 auto",
        border: "1px solid #e7ddd1",
        borderRadius: 12,
      }}
    >
      <style media="print">{`
        @page { size: A4; margin: 14mm; }
        body:has(.jayds-invoice) { background: white !important; overflow: visible !important; }
        body:has(.jayds-invoice) .ops-sidebar, body:has(.jayds-invoice) .ops-topbar,
        body:has(.jayds-invoice) [data-admin-toasts], body:has(.jayds-invoice) [class~="print:hidden"] { display: none !important; }
        body:has(.jayds-invoice) .admin-shell { display: block !important; }
        body:has(.jayds-invoice) .admin-shell, body:has(.jayds-invoice) .ops-main, body:has(.jayds-invoice) .ops-main > main, body:has(.jayds-invoice) .ops-page { min-height: 0 !important; height: auto !important; background: white !important; }
        body:has(.jayds-invoice) .ops-main { margin: 0 !important; }
        body:has(.jayds-invoice) .ops-main > main { padding: 0 !important; }
        body:has(.jayds-invoice) .ops-page > :not(.ops-overlay) { display: none !important; }
        .ops-overlay:has(.jayds-invoice), .ops-drawer:has(.jayds-invoice) { position: static !important; display: block !important; width: 100% !important; max-width: none !important; height: auto !important; max-height: none !important; padding: 0 !important; overflow: visible !important; background: white !important; border: 0 !important; box-shadow: none !important; backdrop-filter: none !important; }
        .ops-drawer:has(.jayds-invoice) > header { display: none !important; }
        .ops-drawer:has(.jayds-invoice) .ops-drawer-body { overflow: visible !important; padding: 0 !important; }
        .jayds-invoice { width: 100% !important; max-width: none !important; border: 0 !important; border-radius: 0 !important; break-after: auto; }
        .jayds-invoice tr, .jayds-invoice dl { break-inside: avoid; }
      `}</style>
      <header>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{b.trade_name}</h2>
        <p>{b.registered_name}</p>
        <p>{b.address}</p>
        <p>
          TIN {b.tin} · Branch {b.branch_code}
        </p>
      </header>
      <hr style={{ margin: "20px 0" }} />
      <h3 style={{ fontSize: 20, fontWeight: 700 }}>
        {invoice.kind === "invoice" ? "Invoice" : "Credit note"}{" "}
        {invoice.number}
      </h3>
      <p>
        {new Intl.DateTimeFormat("en-PH", {
          timeZone: "Asia/Manila",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(invoice.issued_at))}
      </p>
      <p>Buyer: {invoice.buyer.name}</p>
      {invoice.original_number && (
        <p>Credits invoice: {invoice.original_number}</p>
      )}
      <div style={{ overflowX: "auto", marginTop: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption style={{ textAlign: "left" }}>
            Item amounts in Philippine pesos
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left" }}>
                Item
              </th>
              <th scope="col">Qty</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Unit price
              </th>
              <th scope="col" style={{ textAlign: "right" }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {f.lines.map((line) => (
              <tr key={line.index}>
                <td style={{ padding: "10px 0" }}>
                  {line.name}
                  {line.eligible_quantity > 0 && (
                    <small style={{ display: "block" }}>
                      Personal portion: {line.eligible_quantity}
                    </small>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>{line.quantity}</td>
                <td style={{ textAlign: "right" }}>
                  {php(line.gross / line.quantity)}
                </td>
                <td style={{ textAlign: "right" }}>{php(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "8px 20px",
          marginTop: 20,
        }}
      >
        <dt>Menu amount, VAT included</dt>
        <dd>{php(f.gross)}</dd>
        <dt>VAT relief</dt>
        <dd>{php(f.vat_relief)}</dd>
        <dt>Discount</dt>
        <dd>{php(f.discount)}</dd>
        <dt>VATable sales</dt>
        <dd>{php(f.taxable_sales)}</dd>
        <dt>VAT-exempt sales</dt>
        <dd>{php(f.exempt_sales)}</dd>
        <dt>VAT (12%, included)</dt>
        <dd>{php(f.vat)}</dd>
        <dt>Delivery charge</dt>
        <dd>{php(f.delivery)}</dd>
        {Number(f.delivery_tax) > 0 && (
          <>
            <dt>Delivery VAT (included in charge)</dt>
            <dd>{php(f.delivery_tax!)}</dd>
          </>
        )}
        <dt style={{ fontWeight: 700 }}>
          Total {invoice.kind === "credit_note" ? "credited" : "paid"}
        </dt>
        <dd style={{ fontWeight: 700 }}>{php(f.total)}</dd>
      </dl>
      {f.delivery > 0 && f.delivery_tax === null && (
        <p style={{ marginTop: 16 }}>
          Delivery tax treatment awaits operator/accountant configuration.
        </p>
      )}
      <footer style={{ fontSize: 12, marginTop: 24 }}>
        {b.numbering === "system_generated" ? (
          <p>
            System-generated invoice number. {b.authority_basis}. Registered
            serial authorization has not been independently verified.
          </p>
        ) : (
          <p>
            Authorization {b.authorization_reference} · {b.authorization_date} ·
            Approved serials {b.approved_serial_start}–{b.approved_serial_end}
          </p>
        )}
      </footer>
    </article>
  );
}
