export const JSON_BODY_LIMIT = 32 * 1024;
export const ORDER_BODY_LIMIT = 256 * 1024;
export const WEBHOOK_BODY_LIMIT = 512 * 1024;
const BODY_TIMEOUT_MS = 10_000;

export class JsonBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 408 | 413,
  ) {
    super(message);
    this.name = "JsonBodyError";
  }
}

function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  // An underlying cancel hook can stall too. Never wait for it before responding.
  try {
    void reader.cancel().catch(() => {});
  } catch {
    // A disconnected or released body needs no further cancellation.
  }
}

/** Read an object JSON body without trusting its advertised Content-Length.
 * Route-specific field validation remains the caller's responsibility.
 */
// Match Request.json's dynamic field boundary for existing route validators.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJsonBody<T = Record<string, any>>(
  request: Request,
  { maxBytes = JSON_BODY_LIMIT, timeoutMs = BODY_TIMEOUT_MS } = {},
): Promise<T> {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1
  )
    throw new Error("Invalid JSON body reader limits");
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    if (!request.body) throw new Error("Missing body");
    reader = request.body.getReader();
  } catch {
    throw new JsonBodyError("Enter a valid JSON request.", 400);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const declared = request.headers.get("content-length");
    if (declared !== null) {
      if (!/^\d+$/.test(declared))
        throw new JsonBodyError("Enter a valid JSON request.", 400);
      if (Number(declared) > maxBytes)
        throw new JsonBodyError("The request body is too large.", 413);
    }
    if (request.signal.aborted)
      throw new JsonBodyError("The request body could not be read.", 400);
    // A single deadline covers the entire stream, including a slow sequence of chunks.
    const deadline = performance.now() + timeoutMs;
    const timedOut = () =>
      new JsonBodyError("The request body took too long to receive.", 408);
    const stopped = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(timedOut()), timeoutMs);
      onAbort = () =>
        reject(new JsonBodyError("The request body could not be read.", 400));
      request.signal.addEventListener("abort", onAbort, { once: true });
    });
    const readText = async () => {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const parts: string[] = [];
      let received = 0;
      while (true) {
        // Also bound synchronous/empty chunks that can starve the timeout callback.
        if (performance.now() >= deadline) throw timedOut();
        const { done, value } = await reader.read();
        if (performance.now() >= deadline) throw timedOut();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes)
          throw new JsonBodyError("The request body is too large.", 413);
        const part = decoder.decode(value, { stream: true });
        if (part) parts.push(part);
      }
      parts.push(decoder.decode());
      return parts.join("");
    };
    // One race avoids retaining a pending timeout reaction for every tiny chunk.
    const parsed: unknown = JSON.parse(
      await Promise.race([readText(), stopped]),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new JsonBodyError("Enter a valid JSON request object.", 400);
    return parsed as T;
  } catch (error) {
    cancelReader(reader);
    if (error instanceof JsonBodyError) throw error;
    // Never expose parser messages, submitted values, or stream failure details.
    throw new JsonBodyError("Enter a valid JSON request.", 400);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) request.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
