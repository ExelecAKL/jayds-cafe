import { createHmac, timingSafeEqual } from "node:crypto";

export interface DeliveryQuote {
  branchVersion?: string;
  quotationId: string;
  fee: number;
  expiresAt: string;
  lat: number;
  lng: number;
  address: string;
}

function sign(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing delivery quote signing key");
  return createHmac("sha256", secret)
    .update(`cafeos.delivery-quote.v1:${payload}`)
    .digest();
}

export function createQuoteToken(quote: DeliveryQuote): string {
  const payload = Buffer.from(JSON.stringify(quote)).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function readQuoteToken(token: unknown): DeliveryQuote | null {
  if (typeof token !== "string" || token.length > 16_384) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = sign(payload);
  const supplied = Buffer.from(signature, "base64url");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return null;

  try {
    const quote = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as DeliveryQuote;
    if (
      !quote ||
      typeof quote.quotationId !== "string" ||
      !quote.quotationId ||
      !Number.isFinite(quote.fee) ||
      quote.fee < 0 ||
      !Number.isFinite(quote.lat) ||
      !Number.isFinite(quote.lng) ||
      typeof quote.address !== "string" ||
      !(Date.parse(quote.expiresAt) > Date.now())
    )
      return null;
    return quote;
  } catch {
    return null;
  }
}
