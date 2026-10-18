export interface InvoiceMailConfig {
  apiKey: string;
  from: string;
}
export function invoiceMailConfig(
  env: Record<string, string | undefined>,
): InvoiceMailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim(),
    from = env.INVOICE_EMAIL_FROM?.trim();
  if (
    !apiKey ||
    !from ||
    /[\r\n]/.test(from) ||
    from.length > 200 ||
    !/^[^<>]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/.test(from)
  )
    return null;
  return { apiKey, from };
}
export class InvoiceMailError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(
      status
        ? `Email provider returned ${status}`
        : "Email provider response unavailable",
    );
  }
}
export async function deliverInvoiceEmail(
  config: InvoiceMailConfig,
  key: string,
  payload: unknown,
  transport: typeof fetch = fetch,
) {
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new InvoiceMailError(
        [408, 409, 425, 429].includes(response.status) ||
          response.status >= 500,
        response.status,
      );
    const result = await response.json();
    if (typeof result.id !== "string" || !result.id || result.id.length > 200)
      throw new InvoiceMailError(true);
    return result.id as string;
  } catch (error) {
    if (error instanceof InvoiceMailError) throw error;
    throw new InvoiceMailError(true);
  }
}
