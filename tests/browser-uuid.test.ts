import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createUuid } from "../packages/shared/src/utils/uuid.ts";
import {
  submissionKey,
  retryPayload,
  clearSubmission,
} from "../packages/shared/src/inventory/client.ts";

test("LAN HTTP UUID generation preserves version, variant and cryptographic entropy without randomUUID", () => {
  const lanCrypto = {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  } as Crypto;
  const ids = new Set(
    Array.from({ length: 1000 }, () => createUuid(lanCrypto)),
  );
  assert.equal(ids.size, 1000);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  assert.throws(() => createUuid({} as Crypto), /Secure random generation/);
});
test("blocked browser storage retains the same submission key and immutable retry payload until cleared", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw Error("Storage blocked");
    },
  });
  try {
    const first = retryPayload("isolated", {
      total: 100,
      expires_at: "first",
      pickup_confirmation_hash: "first",
    });
    const key = submissionKey("isolated", first);
    const retry = retryPayload("isolated", {
      total: 100,
      expires_at: "later",
      pickup_confirmation_hash: "later",
    });
    assert.deepEqual(retry, first);
    assert.equal(submissionKey("isolated", retry), key);
    assert.notEqual(submissionKey("isolated", { total: 101 }), key);
    clearSubmission("isolated");
    assert.notEqual(submissionKey("isolated", first), key);
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
    clearSubmission("isolated");
  }
});
