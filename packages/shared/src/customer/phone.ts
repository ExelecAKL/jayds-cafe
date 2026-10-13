export function normalizeContactPhone(phone: string): string {
  return phone.trim().replace(/[\s()-]/g, "");
}

export function isValidContactPhone(phone: string): boolean {
  return /^(?:\+?[1-9]\d{7,14}|09\d{9})$/.test(phone);
}
