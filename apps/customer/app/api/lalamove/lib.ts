// apps/customer/app/api/lalamove/lib.ts
// Lalamove HMAC SHA256 authentication helper — server-side only

import crypto from "crypto";
import { lalamoveFailure } from "./policy";

const API_KEY = process.env.LALAMOVE_API_KEY!;
const API_SECRET = process.env.LALAMOVE_API_SECRET!;
const BASE_URL =
  process.env.LALAMOVE_BASE_URL || "https://rest.sandbox.lalamove.com";

// Cafe pickup location constants
export const PICKUP = {
  lat: process.env.LALAMOVE_PICKUP_LAT || "14.346621",
  lng: process.env.LALAMOVE_PICKUP_LNG || "120.981057",
  address:
    process.env.LALAMOVE_PICKUP_ADDRESS || "Jayds Cafe, Dasmariñas, Cavite",
  phone: process.env.LALAMOVE_SENDER_PHONE || "+639663866177",
  name: "Jayds Cafe",
};

export function generateLalamoveHeaders(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: string,
): Record<string, string> {
  const time = Date.now().toString();

  // Signature = HMAC-SHA256( timestamp\r\nmethod\r\npath\r\n\r\nbody , secret )
  const rawSignature = body
    ? `${time}\r\n${method}\r\n${path}\r\n\r\n${body}`
    : `${time}\r\n${method}\r\n${path}\r\n\r\n`;

  const signature = crypto
    .createHmac("sha256", API_SECRET)
    .update(rawSignature)
    .digest("hex");

  const token = `${API_KEY}:${time}:${signature}`;

  return {
    Authorization: `hmac ${token}`,
    "Content-Type": "application/json",
    Market: "PH",
    "Request-ID": crypto.randomUUID(),
  };
}

export async function lalamoveRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
  requestId?: string,
): Promise<{ data?: T; error?: string; errorCode?: string; status: number }> {
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const headers = generateLalamoveHeaders(method, path, bodyStr);
  if (requestId) headers["Request-ID"] = requestId;
  const url = `${BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(20_000),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ...lalamoveFailure(
          res.status,
          json,
          BASE_URL === "https://rest.sandbox.lalamove.com",
        ),
        status: res.status,
      };
    }

    return { data: json as T, status: res.status };
  } catch {
    return {
      error:
        "Courier response is uncertain. Reconciliation is required before retrying.",
      status: 0,
    };
  }
}
