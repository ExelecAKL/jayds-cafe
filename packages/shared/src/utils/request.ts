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

// Network quality signals for the connection banner. A request still waiting
// after SLOW_AFTER means the line is weak; a quick answer means it recovered;
// a transport failure or timeout (not a caller's own cancel) means trouble.
const SLOW_AFTER = 4_000;
const QUICK_UNDER = 1_500;
function networkSignal(name: "slow" | "ok" | "error") {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(`jayds:network-${name}`));
}
function monitored(
  request: Promise<Response>,
  callerSignal: AbortSignal | undefined,
) {
  if (typeof window === "undefined") return request;
  const started = Date.now();
  const slow = setTimeout(() => networkSignal("slow"), SLOW_AFTER);
  return request.then(
    (response) => {
      clearTimeout(slow);
      if (Date.now() - started < QUICK_UNDER) networkSignal("ok");
      return response;
    },
    (error: unknown) => {
      clearTimeout(slow);
      if (!callerSignal?.aborted) networkSignal("error");
      throw error;
    },
  );
}

/**
 * The deadline remains active while response bodies are read by the SDK.
 * On mobile data a read can fail on a momentary drop, so a read (GET/HEAD)
 * that fails in transport is retried once after a short pause. Writes are
 * never retried here: repeating them could duplicate an action.
 */
export const browserFetch: typeof fetch = (input, init) => {
  const callerSignal =
    init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const attempt = boundedFetch(input, init);
  const resilient =
    method === "GET" || method === "HEAD"
      ? attempt.catch(async (error: unknown) => {
          if (
            callerSignal?.aborted ||
            !(error instanceof TypeError) ||
            (typeof navigator !== "undefined" && !navigator.onLine)
          )
            throw error;
          await new Promise((resolve) => setTimeout(resolve, 1_200));
          if (callerSignal?.aborted) throw error;
          return boundedFetch(input, init);
        })
      : attempt;
  return monitored(resilient, callerSignal ?? undefined);
};

const boundedFetch: typeof fetch = (input, init) => {
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
