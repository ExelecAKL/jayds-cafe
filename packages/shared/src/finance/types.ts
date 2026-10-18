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
