export interface CustomerAttempt {
  owner: string;
  key: string;
  payload: Record<string, unknown>;
  orderId?: string;
  orderNumber?: string;
  createdAt: string;
}
const name = (owner: string) => "jayds-checkout-attempt:" + owner;
export function readCustomerAttempt(owner: string): CustomerAttempt | null {
  try {
    const a = JSON.parse(localStorage.getItem(name(owner)) ?? "null");
    return a?.owner === owner &&
      typeof a.key === "string" &&
      a.payload &&
      typeof a.payload === "object"
      ? a
      : null;
  } catch {
    return null;
  }
}
export function saveCustomerAttempt(attempt: CustomerAttempt) {
  localStorage.setItem(name(attempt.owner), JSON.stringify(attempt));
}
export function clearCustomerAttempt(owner: string, confirmed = false) {
  try {
    localStorage.removeItem(name(owner));
    sessionStorage.removeItem("checkout_confirm");
    if (confirmed) sessionStorage.removeItem("jayds-checkout-form:" + owner);
  } catch {}
}
