export interface RegisterOption {
  variant_group: string;
  label: string;
  price_modifier: number;
}
export interface RegisterLine {
  line_id: string;
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  variants: RegisterOption[];
  notes: string;
  image_url?: string | null;
}
export interface RegisterCustomer {
  id: string;
  email: string;
  full_name: string | null;
  points: number;
}
export interface RegisterDraft {
  version: 1;
  items: RegisterLine[];
  notes: string;
  customer: RegisterCustomer | null;
  points: number;
  parked_order_id: string | null;
  pending_checkout?: { key: string; payload: Record<string, unknown> };
  pending_park?: { key: string; payload: Record<string, unknown> };
}
export interface CashPayment {
  cash_received: number;
  amount_paid: number;
  change_due: number;
  created_at: string;
}
export interface CheckoutResult {
  id: string;
  order_number: string;
  total: number;
  payment_status: string;
  status: string;
  payment: CashPayment | null;
  receipt: {
    receipt_token: string;
    receipt_data: {
      order_number: string;
      total: number;
      subtotal?: number;
      discount?: number;
      cash_received?: number | null;
      change_due?: number | null;
      items: {
        name: string;
        qty: number;
        price: number;
        variants?: RegisterOption[];
        notes?: string | null;
      }[];
    };
    expires_at: string;
  } | null;
  already_paid?: boolean;
}
export interface StatusBoard {
  branch_name: string;
  version: number;
  orders: { order_number: string; status: "preparing" | "ready" }[];
}
