import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CatalogValidationError,
  submitAtomicOrder,
} from "../packages/shared/src/inventory/orders.ts";

test("unexpected order database failures hide SQL details and remain retryable; business conflicts retain their explanation", async () => {
  for (const code of ["42883", "42P01", "42703", "42501"]) {
    const db = {
      rpc: async () => ({
        data: null,
        error: {
          code,
          message:
            "function gen_random_bytes(integer) does not exist; private schema detail",
        },
      }),
    } as unknown as SupabaseClient;
    await assert.rejects(
      submitAtomicOrder(
        db,
        {},
        [],
        { key: "retry-key", fingerprint: "same-ticket" },
        null,
      ),
      (error) => {
        assert.ok(error instanceof CatalogValidationError);
        assert.equal(error.status, 503);
        assert.match(error.message, /Your bag is saved/);
        assert.doesNotMatch(error.message, /gen_random_bytes|private schema/);
        return true;
      },
    );
  }
  const conflict = {
    rpc: async () => ({
      data: null,
      error: { code: "P0001", message: "An item is no longer available" },
    }),
  } as unknown as SupabaseClient;
  await assert.rejects(
    submitAtomicOrder(
      conflict,
      {},
      [],
      { key: "conflict-key", fingerprint: "ticket" },
      null,
    ),
    (error) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "An item is no longer available");
      return true;
    },
  );
});
