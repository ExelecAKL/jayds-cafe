// packages/shared/src/types/index.ts
// All shared TypeScript types for CafeOS

// ── Enums ───────────────────────────────────────────────────

export type UserRole = 'customer' | 'staff' | 'admin';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type OrderType = 'pickup' | 'delivery' | 'dine_in' | 'takeout'; // pickup & delivery are primary; dine_in/takeout kept for legacy
export type OrderSource = 'app' | 'pos';
export type PaymentMethod = 'cash' | 'maya';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

// ── Profile ─────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  phone: string | null;
  account_qr_hash: string;
  points: number;
  total_orders: number;
  last_check_in: string | null;
  loyalty_tier: string;
  favorite_items: string[];
  total_spent: number;
  last_order_at: string | null;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

// ── Category ────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

// ── Menu Item ───────────────────────────────────────────────

export interface MenuItem {
  included_milk?: string | null;
  manually_available?: boolean;
  availability_reason?: string | null;
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  prep_time_minutes: number;
  sort_order: number;
  tags: string[];
  status: 'active' | 'archived';
  recipe_required: boolean;
  created_at: string;
  updated_at: string;
  category?: Category;
  variants?: ItemVariant[];
}

// ── Item Variant ────────────────────────────────────────────

export interface ItemVariant {
  is_available?: boolean;
  id: string;
  menu_item_id: string;
  variant_group: string;
  label: string;
  price_modifier: number;
  is_default: boolean;
  sort_order: number;
  applicable_items: string[] | null; // null = applies to all items in category
  created_at: string;
}

// ── Order ───────────────────────────────────────────────────

export interface Order {
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
  preparation_due_at?: string | null;
  scheduled_item_units?: number | null;
  is_parked?: boolean;
  stock_conflict?: boolean;
  inventory_managed?: boolean;
  inventory_consumed?: boolean;
  id: string;
  order_number: string;
  customer_id: string | null;
  status: OrderStatus;
  order_type: OrderType;
  order_source: OrderSource;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  total: number;
  discount: number;
  points_earned: number;
  points_redeemed: number;
  notes: string | null;
  maya_checkout_id: string | null;
  maya_checkout_url: string | null;
  maya_payment_id: string | null;
  staff_id: string | null;
  // Delivery fields
  delivery_address: string | null;
  delivery_fee: number;
  delivery_lat: number | null;
  delivery_lng: number | null;
  lalamove_order_id: string | null;
  lalamove_quotation_id: string | null;
  lalamove_status: string | null;
  lalamove_share_link: string | null;
  // Cached order fields
  expires_at: string | null;
  pickup_confirmation_hash: string | null;
  advance_order_key: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  customer?: Profile;
  status_history?: OrderStatusHistory[];
}

// ── Order Item ──────────────────────────────────────────────

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  price: number;
  quantity: number;
  variants: SelectedVariant[];
  subtotal: number;
  notes: string | null;
  created_at: string;
}

// ── Selected Variant (stored as JSONB in order_items) ───────

export interface SelectedVariant {
  variant_group: string;
  label: string;
  price_modifier: number;
}

// ── Order Status History ────────────────────────────────────

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  previous_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
}

// ── Cart Types ──────────────────────────────────────────────

export interface CartItem {
  id: string; // unique cart item key (menuItemId + variant combo hash)
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  variants: SelectedVariant[];
  image_url: string | null;
  prep_time_minutes: number;
  notes: string | null;
}

export type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: { id: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { id: string; quantity: number } }
  | { type: 'UPDATE_NOTES'; payload: { id: string; notes: string } }
  | { type: 'CLEAR_CART' };

export interface CartState {
  items: CartItem[];
  total: number;
  itemCount: number;
}

export interface AppliedVoucher {
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  applicable_item_ids?: string[] | null;
  application_mode?: 'whole_order' | 'selected_items';
  max_discount_amount?: number | null;
}

export interface Voucher {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  applicable_item_ids?: string[] | null;
  application_mode?: 'whole_order' | 'selected_items';
  max_discount_amount?: number | null;
  created_at: string;
}

// ── Maya Types ──────────────────────────────────────────────

export interface MayaCheckoutRequest {
  totalAmount: {
    value: number;
    currency: string;
    details?: {
      subtotal: number;
      discount: number;
      serviceCharge: number;
      shippingFee: number;
      tax: number;
    };
  };
  buyer: {
    firstName: string;
    lastName: string;
    contact: {
      phone: string;
      email: string;
    };
    shippingAddress: {
      line1: string;
      city: string;
      state: string;
      zipCode: string;
      countryCode: string;
    };
    billingAddress: {
      line1: string;
      city: string;
      state: string;
      zipCode: string;
      countryCode: string;
    };
  };
  items: {
    name: string;
    quantity: number;
    code: string;
    description: string;
    amount: {
      value: number;
      currency: string;
    };
    totalAmount: {
      value: number;
      currency: string;
    };
  }[];
  redirectUrl: {
    success: string;
    failure: string;
    cancel: string;
  };
  requestReferenceNumber: string;
  metadata?: Record<string, string>;
}

export interface MayaCheckoutResponse {
  checkoutId: string;
  redirectUrl: string;
}

export interface MayaWebhookPayload {
  id: string;
  isPaid: boolean;
  status: string;
  paymentStatus: string;
  requestReferenceNumber: string;
  metadata?: Record<string, string>;
  receipt?: {
    transactionId: string;
  };
}

// ── Dashboard Stats ─────────────────────────────────────────

export interface DashboardStats {
  todayRevenue: number;
  todayOrderCount: number;
  activeOrders: number;
  pendingOrders: number;
}

// ── Inventory / Ingredients ─────────────────────────────────

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
  cost_per_unit: number;
  supplier: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItemIngredient {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity_used: number;
  size_multipliers: Record<string, number>;
  ingredient?: Ingredient;
  menu_item?: MenuItem;
}

export interface VariantIngredient {
  id: string;
  variant_label: string;
  variant_group: string;
  ingredient_id: string;
  quantity_used: number;
  size_multipliers?: Record<string, number>;
  replaces_ingredient_id: string | null;
  ingredient?: Ingredient;
}

export type InventoryChangeType =
  | 'order_deduction'
  | 'manual_restock'
  | 'manual_adjustment'
  | 'waste'
  | 'opening_stock';

export interface InventoryLog {
  id: string;
  ingredient_id: string;
  change_amount: number;
  change_type: InventoryChangeType;
  order_id: string | null;
  staff_id: string | null;
  notes: string | null;
  stock_after: number;
  created_at: string;
  ingredient?: Ingredient;
}

// ── Shifts ──────────────────────────────────────────────────

export interface Shift {
  id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number | null;
  orders_handled: number;
  total_sales: number;
  notes: string | null;
  created_at: string;
  staff?: Profile;
}

// ── Loyalty ─────────────────────────────────────────────────

export interface LoyaltyTier {
  id: string;
  name: string;
  min_points: number;
  color: string;
  perks: string[];
  badge_emoji: string;
  created_at: string;
}

// ── Notification ────────────────────────────────────────────

export type NotificationType = 'stock_alert' | 'order_update' | 'promo' | 'system' | 'voucher';

export interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  body: string;
  type: NotificationType;
  is_read: boolean;
  data: Record<string, unknown>;
  created_at: string;
}

// ── Clock Entry ────────────────────────────────────────────

export interface ClockEntry {
  id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number | null;
  notes: string | null;
  created_at: string;
  staff?: Profile;
}

// ── Voucher Claim ──────────────────────────────────────────

export interface VoucherClaim {
  id: string;
  voucher_id: string;
  user_id: string;
  claimed_at: string;
  expires_at: string | null;
  used_at: string | null;
  order_id: string | null;
  voucher?: Voucher;
}

// ── Admin Voucher (extended) ───────────────────────────────

export interface AdminVoucher extends Voucher {
  target_tier: string | null;
  target_users: string[] | null;
  frequency_limit: number | null;
  deployed_at: string | null;
}

// ── Void Log ────────────────────────────────────────────────

export interface VoidLog {
  id: string;
  order_id: string;
  staff_id: string;
  created_at: string;
  staff?: { full_name: string; email: string };
  order?: { order_number: string };
}
