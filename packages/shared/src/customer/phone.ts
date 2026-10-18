export function normalizeContactPhone(phone: string): string {
  return phone.trim().replace(/[\s()-]/g, "");
}

export function isValidContactPhone(phone: string): boolean {
  return /^(?:\+?[1-9]\d{7,14}|09\d{9})$/.test(phone);
}

/** Registration uses a local Philippine mobile number, with formatted paste support. */
export function registrationPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return (digits.startsWith("63") ? "0" + digits.slice(2) : digits).slice(
    0,
    11,
  );
}

export function isValidRegistrationPhone(value: string): boolean {
  return /^09\d{9}$/.test(normalizeContactPhone(value));
}
