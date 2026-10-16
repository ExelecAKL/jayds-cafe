/** Bounds the whole operation, including time waiting for an auth session. */
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 12_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("This is taking too long. Please try again.");
          error.name = "RequestTimeoutError";
          reject(error);
          controller.abort(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** The deadline remains active while response bodies are read by the SDK. */
export const browserFetch: typeof fetch = (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const timeoutMs = url.includes("/storage/v1/") ? 60_000 : 20_000;
  const timerController = new AbortController();
  const timeout =
    typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : timerController.signal;
  if (typeof AbortSignal.timeout !== "function")
    setTimeout(() => timerController.abort(), timeoutMs);
  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (!signal) return fetch(input, { ...init, signal: timeout });
  if (typeof AbortSignal.any === "function")
    return fetch(input, {
      ...init,
      signal: AbortSignal.any([signal, timeout]),
    });
  const combined = new AbortController();
  const abort = () => {
    combined.abort();
    signal.removeEventListener("abort", abort);
    timeout.removeEventListener("abort", abort);
  };
  if (signal.aborted || timeout.aborted) abort();
  else {
    signal.addEventListener("abort", abort, { once: true });
    timeout.addEventListener("abort", abort, { once: true });
  }
  return fetch(input, { ...init, signal: combined.signal });
};
