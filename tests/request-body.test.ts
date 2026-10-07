import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  JsonBodyError,
  JSON_BODY_LIMIT,
  ORDER_BODY_LIMIT,
  WEBHOOK_BODY_LIMIT,
  readJsonBody,
} from "../packages/shared/src/server/request-body.ts";

// Stream fixtures only: no environment file, database, or provider request.
const encode = (value: string) => new TextEncoder().encode(value);
function streamed(
  chunks: Uint8Array[],
  headers: HeadersInit = {},
  cancel: () => void | Promise<void> = () => {},
) {
  let position = 0;
  return new Request("https://cafe.test/api", {
    method: "POST",
    headers,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (position < chunks.length) controller.enqueue(chunks[position++]);
        else controller.close();
      },
      cancel,
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}
function bodyError(status: number) {
  return (error: unknown) => {
    assert.ok(error instanceof JsonBodyError);
    assert.equal(error.status, status);
    assert.doesNotMatch(error.message, /private-value|customer@|SyntaxError/);
    return true;
  };
}

test("JSON reader accepts valid UTF-8 split inside a character and counts bytes exactly", async () => {
  const value = { message: "Café ☕", quantity: 2 },
    bytes = encode(JSON.stringify(value));
  const split = bytes.findIndex((byte) => byte === 0xc3) + 1;
  assert.deepEqual(
    await readJsonBody(streamed([bytes.slice(0, split), bytes.slice(split)]), {
      maxBytes: bytes.length,
    }),
    value,
  );
  await assert.rejects(
    readJsonBody(streamed([bytes]), { maxBytes: bytes.length - 1 }),
    bodyError(413),
  );
});

test("order allowance accepts 100 tickets with long notes and multiple modifiers", async () => {
  const order = {
    order_type: "pickup",
    payment_method: "maya",
    request_id: "isolated-order-request",
    items: Array.from({ length: 100 }, () => ({
      menu_item_id: "10000000-0000-4000-8000-000000000001",
      quantity: 1,
      notes: "Espresso customization ☕ ".repeat(20),
      variants: Array.from({ length: 10 }, (_, i) => ({
        variant_group: `Group ${i}`,
        label: "Accepted customization option",
        price_modifier: 10,
      })),
    })),
  };
  const bytes = encode(JSON.stringify(order));
  assert.ok(bytes.length > JSON_BODY_LIMIT && bytes.length < ORDER_BODY_LIMIT);
  const parsed = await readJsonBody<typeof order>(streamed([bytes]), {
    maxBytes: ORDER_BODY_LIMIT,
  });
  assert.equal(parsed.items.length, 100);
  assert.equal(parsed.items[99].notes, order.items[99].notes);
});

test("streamed oversize bodies without Content-Length or with a forged small length are cancelled", async () => {
  const advertisedLengths: HeadersInit[] = [{}, { "Content-Length": "2" }];
  for (const headers of advertisedLengths) {
    let cancelled = false;
    const request = streamed(
      [
        encode('{"message":"'),
        encode("a".repeat(JSON_BODY_LIMIT)),
        encode('"}'),
      ],
      headers,
      () => {
        cancelled = true;
      },
    );
    await assert.rejects(readJsonBody(request), bodyError(413));
    assert.equal(cancelled, true);
  }
});

test("oversize declared length rejects before reading and does not await a stalled cancel hook", async () => {
  let cancelled = false;
  const request = new Request("https://cafe.test/api", {
    method: "POST",
    headers: { "Content-Length": String(JSON_BODY_LIMIT + 1) },
    body: new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await assert.rejects(readJsonBody(request), bodyError(413));
  assert.equal(cancelled, true);
  assert.equal(request.body?.locked, false);
});

test("malformed JSON, malformed UTF-8, empty and nonobject bodies have sanitized 400 errors", async () => {
  for (const bytes of [
    encode('{"customer@private-value":'),
    new Uint8Array([123, 34, 0xff, 34, 58, 49, 125]),
    encode(""),
    encode("null"),
    encode("[]"),
    encode("true"),
  ])
    await assert.rejects(readJsonBody(streamed([bytes])), bodyError(400));
  await assert.rejects(
    readJsonBody(new Request("https://cafe.test/api", { method: "POST" })),
    bodyError(400),
  );
});

test("stalled reads time out, release their reader, and do not await underlying cancellation", async () => {
  let cancelled = false;
  const request = new Request("https://cafe.test/api", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
        return new Promise<void>(() => {});
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await assert.rejects(
    readJsonBody(request, { timeoutMs: 20 }),
    bodyError(408),
  );
  assert.equal(cancelled, true);
  assert.equal(request.body?.locked, false);
});

test("a steady trickle cannot reset the whole-body deadline", async () => {
  let cancelled = false,
    chunks = 0;
  let interval: ReturnType<typeof setInterval>;
  const request = new Request("https://cafe.test/api", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode('{"value":'));
        interval = setInterval(() => {
          chunks++;
          controller.enqueue(encode(" "));
        }, 3);
      },
      cancel() {
        cancelled = true;
        clearInterval(interval);
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  try {
    await assert.rejects(
      readJsonBody(request, { timeoutMs: 35 }),
      bodyError(408),
    );
    assert.ok(chunks > 0);
    assert.equal(cancelled, true);
  } finally {
    clearInterval(interval!);
  }
});

test("continuously available empty chunks cannot starve the read deadline", async () => {
  let cancelled = false;
  const request = new Request("https://cafe.test/api", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array());
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await assert.rejects(
    readJsonBody(request, { timeoutMs: 20 }),
    bodyError(408),
  );
  assert.equal(cancelled, true);
});

test("client aborts and failing body streams return sanitized errors and cancel promptly", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const request = new Request("https://cafe.test/api", {
    method: "POST",
    signal: controller.signal,
    body: new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const reading = readJsonBody(request);
  controller.abort(new Error("private-value"));
  await assert.rejects(reading, bodyError(400));
  assert.equal(cancelled, true);
  const failure = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.error(new Error("private-value"));
    },
  });
  await assert.rejects(
    readJsonBody(
      new Request("https://cafe.test/api", {
        method: "POST",
        body: failure,
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
    ),
    bodyError(400),
  );
});

const nodeRequire = createRequire(import.meta.url);
const readerModule = {
  JsonBodyError,
  readJsonBody,
  JSON_BODY_LIMIT,
  ORDER_BODY_LIMIT,
  WEBHOOK_BODY_LIMIT,
};
const responses = {
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  },
};
function load<T>(file: string, mocks: Record<string, unknown>): T {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    source,
    {
      module: loaded,
      exports: loaded.exports,
      require: (name: string) =>
        name === "@cafeos/shared/server/request-body"
          ? readerModule
          : (mocks[name] ?? nodeRequire(name)),
      process: { env: {} },
      Buffer,
      URL,
      Request,
      Response,
      Date,
      AbortController,
      AbortSignal,
      setTimeout,
      clearTimeout,
      console: { error() {}, log() {}, warn() {} },
      fetch() {
        throw Error("External requests forbidden");
      },
    },
    { filename: file },
  );
  return loaded.exports as T;
}
type PostRoute = { POST: (req: Request) => Promise<Response> };
const forbiddenDatabase = {
  createAdminSupabaseClient() {
    throw Error("Database requests forbidden");
  },
};

test("guest JSON route preserves private public 400/413 responses before grant or database access", async () => {
  const access = load<typeof import("../apps/customer/lib/server-access.ts")>(
    "apps/customer/lib/server-access.ts",
    {
      "next/server": responses,
      "@cafeos/shared/supabase/server": forbiddenDatabase,
    },
  );
  const route = load<PostRoute>("apps/customer/app/api/orders/guest/route.ts", {
    "next/server": responses,
    "../../../../lib/server-access": access,
  });
  for (const [bytes, status] of [
    [encode('{"private-value":'), 400],
    [encode(" ".repeat(JSON_BODY_LIMIT + 1)), 413],
  ] as const) {
    const response = await route.POST(streamed([bytes]));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Cookie, Authorization");
    assert.doesNotMatch((await response.json()).error, /private-value/);
  }
  const valid = await route.POST(streamed([encode('{"orderIds":[]}')]));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { orders: [] });
});

test("Maya webhook uses the larger byte limit and rejects invalid bodies before provider verification", async () => {
  let verificationCalls = 0;
  const route = load<PostRoute>("apps/customer/app/api/maya/webhook/route.ts", {
    "next/server": responses,
    "@cafeos/shared/supabase/server": { createAdminSupabaseClient: () => ({}) },
    "@cafeos/shared/maya": {
      MayaService: {
        verifyAndUpdateOrder: async () => {
          verificationCalls++;
          return { success: true };
        },
      },
    },
  });
  const malformed = await route.POST(streamed([encode('{"private-value":')]));
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: "Invalid webhook payload",
  });
  assert.equal(
    (await route.POST(streamed([encode(" ".repeat(WEBHOOK_BODY_LIMIT + 1))])))
      .status,
    413,
  );
  assert.equal(verificationCalls, 0);
  const valid = encode(
    JSON.stringify({
      id: "20000000-0000-4000-8000-000000000001",
      ignored: "a".repeat(JSON_BODY_LIMIT),
    }),
  );
  assert.equal((await route.POST(streamed([valid]))).status, 200);
  assert.equal(verificationCalls, 1);
});

test("Admin reconciliation preserves 400/413 public errors before authentication or provider forwarding", async () => {
  const route = load<PostRoute>(
    "apps/admin/app/api/customer-care/reconcile/route.ts",
    {
      "@supabase/supabase-js": {
        createClient() {
          throw Error("Database requests forbidden");
        },
      },
    },
  );
  for (const [bytes, status] of [
    [encode('{"private-value":'), 400],
    [encode(" ".repeat(JSON_BODY_LIMIT + 1)), 413],
  ] as const) {
    const response = await route.POST(
      streamed([bytes], { Authorization: "Bearer isolated-token" }),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch((await response.json()).error, /private-value/);
  }
});
