import type { PickupSlot, ScheduledOrderFields } from './types';

export const PICKUP_TIMEZONE = 'Asia/Manila' as const;
export const PICKUP_WINDOW_MINUTES = 15;
export function manilaDate(value: Date | string = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PICKUP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}
export function tomorrowManilaDate(value: Date | string = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return manilaDate(new Date(date.getTime() + 86_400_000));
}
export function formatPickupWindow(start: string, end: string) {
  const options: Intl.DateTimeFormatOptions = { timeZone: PICKUP_TIMEZONE, hour: 'numeric', minute: '2-digit' };
  const day = new Date(start).toLocaleDateString('en-PH', { timeZone: PICKUP_TIMEZONE, month: 'short', day: 'numeric' });
  return `${day}, ${new Date(start).toLocaleTimeString('en-PH', options)} – ${new Date(end).toLocaleTimeString('en-PH', options)}`;
}
export function slotHasCapacity(slot: PickupSlot, itemUnits: number) {
  return Number.isSafeInteger(itemUnits) && itemUnits > 0 && slot.remaining_orders > 0 && slot.remaining_item_units >= itemUnits;
}
export function preparationIsDue(order: ScheduledOrderFields, now = Date.now()) {
  return !order.preparation_due_at || Date.parse(order.preparation_due_at) <= now;
}
