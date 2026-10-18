// PH café deliveries always use the vehicle selected by this quotation.
export const LALAMOVE_SERVICE_TYPE = "MOTORCYCLE";

const messages: Record<string, string> = {
  ERR_INVALID_PHONE_NUMBER:
    "Lalamove could not accept a contact number. Check the café and recipient phone numbers before retrying.",
  ERR_INVALID_QUOTATION_ID:
    "The Lalamove quote has expired or is unavailable. Refresh the delivery quote before booking again.",
  ERR_INVALID_SERVICE_TYPE:
    "Lalamove Motorcycle is unavailable for this route. Check the delivery address before retrying.",
  ERR_OUT_OF_SERVICE_AREA:
    "This address is outside Lalamove’s delivery area. Review the address or arrange pickup.",
  ERR_RATE_LIMIT_EXCEEDED:
    "Lalamove is receiving too many requests. Wait a moment before checking this delivery again.",
};

export function lalamoveFailure(
  status: number,
  payload: unknown,
  sandbox: boolean,
): { error: string; errorCode?: string } {
  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const errors = body.errors;
  const first = Array.isArray(errors) ? errors[0] : errors;
  const id =
    first && typeof first === "object"
      ? (first as Record<string, unknown>).id
      : undefined;
  const candidate = typeof id === "string" ? id : body.message;
  // Never forward provider messages, contact details, or an arbitrary response body.
  if (status === 402 || candidate === "ERR_INSUFFICIENT_CREDIT") {
    return {
      errorCode: "ERR_INSUFFICIENT_CREDIT",
      error: sandbox
        ? "Lalamove’s sandbox wallet has insufficient test credit. Contact Lalamove support to replenish the sandbox balance before booking."
        : "The café’s Lalamove wallet has insufficient credit. Top up the production wallet before booking a motorcycle.",
    };
  }
  if (typeof candidate === "string" && Object.hasOwn(messages, candidate)) {
    return { error: messages[candidate], errorCode: candidate };
  }
  if (status === 401 || status === 403) {
    return {
      errorCode: "COURIER_AUTH_REJECTED",
      error:
        "Lalamove access could not be verified. Ask the café administrator to check the courier credentials and account access.",
    };
  }
  return {
    error: `Courier service returned ${status}. Please retry or contact the café.`,
  };
}
