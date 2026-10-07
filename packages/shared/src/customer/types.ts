export interface BranchHours {
  weekday: number;
  opens: string;
  closes: string;
}
export interface CustomerBranch {
  version: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  delivery_radius_km: number;
  contact_phone: string | null;
  timezone: 'Asia/Manila';
  hours: BranchHours[];
  closures: string[];
  scheduled_pickup_enabled: boolean;
}
export interface PickupSlot {
  start: string;
  end: string;
  preparation_due_at: string;
  remaining_orders: number;
  remaining_item_units: number;
}
export interface PickupSlotsResponse {
  timezone: 'Asia/Manila';
  server_now: string;
  enabled: boolean;
  reason: string | null;
  slots: PickupSlot[];
}
export interface ScheduledOrderFields {
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
  preparation_due_at?: string | null;
  scheduled_item_units?: number | null;
}
export interface BranchAdminSettings {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  delivery_radius_km: number;
  contact_phone: string | null;
  regular_hours: BranchHours[];
  closure_dates: string[];
  scheduled_pickup_enabled: boolean;
  slot_order_capacity: number | null;
  slot_item_capacity: number | null;
  minimum_notice_minutes: number;
  preparation_lead_minutes: number;
  production_verified_at: string | null;
  production_verification_reason: string | null;
}
