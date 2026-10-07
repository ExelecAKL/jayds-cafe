export const EMAIL_CONFIRMATION_NOTICE =
  "Account created. Please check your email and confirm your account before signing in.";

export function getCustomerAuthErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Incorrect email or password. Please check your details and try again.";
  }

  if (
    normalized.includes("email not confirmed") ||
    normalized.includes("confirm")
  ) {
    return "Please confirm your email first. Open the verification email from Jayds Cafe or Supabase, then try signing in again.";
  }

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already registered")
  ) {
    return "This email is already registered. Please sign in instead.";
  }

  if (normalized.includes("password")) {
    return message;
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Please wait a moment, then try again.";
  }

  return message || "Something went wrong. Please try again.";
}
