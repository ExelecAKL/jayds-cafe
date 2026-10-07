import type { Ingredient, MenuItemIngredient } from "../types/index";

export type StockKind = "ingredient" | "packaging" | "finished_good";
export type StockState = "healthy" | "low" | "out" | "overstock";
export interface StockItem extends Ingredient {
  stock_kind: StockKind;
  sku: string | null;
  supplier_id: string | null;
  pack_size: number;
  min_purchase_packs: number;
  lead_time_days: number;
  safety_days: number;
  review_days: number;
  max_stock: number | null;
  reserved_stock: number;
  available_stock: number;
  incoming_stock: number;
  stock_version: number;
}
export interface StockBatch {
  id: string;
  ingredient_id: string;
  batch_code: string;
  quantity: number;
  reserved: number;
  unit_cost: number;
  expires_on: string | null;
  received_at: string;
  receipt_id: string | null;
}
export interface StockMovement {
  id: string;
  ingredient_id: string;
  batch_id: string | null;
  quantity: number;
  movement_type: string;
  balance_after: number;
  actor_id: string | null;
  reason: string;
  order_id: string | null;
  source_id: string | null;
  created_at: string;
}
export interface StockReservation {
  id: string;
  order_id: string;
  ingredient_id: string;
  batch_id: string;
  quantity: number;
  unit_cost: number;
  state: "reserved" | "consumed" | "released";
}
export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  lead_time_days: number;
  is_active: boolean;
  notes: string | null;
}
export type PurchaseOrderStatus =
  "draft" | "approved" | "ordered" | "partial" | "received" | "cancelled";
export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  ingredient_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  ingredient?: StockItem;
}
export interface PurchaseOrder {
  id: string;
  number: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  expected_on: string | null;
  notes: string | null;
  generated: boolean;
  manually_edited: boolean;
  created_at: string;
  supplier?: Supplier;
  lines?: PurchaseOrderLine[];
}
export interface GoodsReceipt {
  id: string;
  purchase_order_id: string | null;
  reference: string;
  actor_id: string | null;
  created_at: string;
}
export interface Stocktake {
  id: string;
  ingredient_id: string;
  expected: number;
  counted: number;
  version: number;
  reason: string;
  state: "draft" | "posted";
  created_at: string;
}
export interface DemandForecast {
  ingredient_id: string;
  horizon: number;
  demand: number;
  daily_demand: number;
  coverage_days: number | null;
  reorder_quantity: number;
  excess_quantity: number;
  expiry_risk_quantity: number;
  incoming_stock: number;
  cost_per_unit: number;
  history_days: number;
  method: string;
  historical_estimate: boolean;
  calculated_at: string;
}
export interface InventorySettings {
  id: boolean;
  enforcement_enabled: boolean;
  branch_name: string;
  catalog_version: number;
  updated_at: string;
}
export interface InventoryReadiness {
  enforcement_enabled: boolean;
  ready: boolean;
  active_orders: number;
  active_stock_items: number;
  missing_recipes: { id: string; name: string }[];
  missing_counts: { id: string; name: string }[];
  invalid_stock: { id: string; name: string }[];
}
export interface Availability {
  available: boolean;
  max_quantity: number;
  reason: string | null;
  options?: Record<string, boolean>;
}
export type RecipeLine = MenuItemIngredient;
