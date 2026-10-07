import assert from "node:assert/strict";
import test from "node:test";
import { resolveCustomerPortalUrl } from "../packages/shared/src/customer-url.ts";

test("cashier receipt URLs follow the actual private LAN host while configured public domains remain authoritative", () => {
  for (const host of [
    "192.168.18.7",
    "192.168.23.21",
    "10.0.0.5",
    "172.20.10.2",
  ])
    assert.equal(
      resolveCustomerPortalUrl("http://localhost:4000/", host),
      `http://${host}:4000`,
    );
  assert.equal(
    resolveCustomerPortalUrl(undefined, "192.168.18.7"),
    "http://192.168.18.7:4000",
  );
  assert.equal(
    resolveCustomerPortalUrl("http://127.0.0.1:4000", "192.168.18.7"),
    "http://192.168.18.7:4000",
  );
  assert.equal(
    resolveCustomerPortalUrl("https://order.example.test/", "192.168.18.7"),
    "https://order.example.test",
  );
  for (const host of [
    "localhost",
    "127.0.0.1",
    "evil.example.test",
    "192.168.18.999",
    "172.32.10.2",
    "192.169.18.7",
  ])
    assert.equal(
      resolveCustomerPortalUrl("http://localhost:4000", host),
      "http://localhost:4000",
    );
  assert.equal(
    resolveCustomerPortalUrl("https://user:pass@evil.test", "192.168.18.7"),
    "http://192.168.18.7:4000",
  );
});
