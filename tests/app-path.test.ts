import assert from "node:assert/strict";
import test from "node:test";
import { appPath } from "../packages/shared/src/utils/app-path";

test("mounted staff and Admin operations stay in their own app", () => {
  assert.equal(
    appPath("/api/orders/checkout", "/staff"),
    "/staff/api/orders/checkout",
  );
  assert.equal(
    appPath("/api/customer-care/reconcile", "/admin"),
    "/admin/api/customer-care/reconcile",
  );
  assert.equal(appPath("/reset-password", "/staff"), "/staff/reset-password");
  assert.equal(appPath("/api/orders/checkout", ""), "/api/orders/checkout");
  assert.equal(
    appPath("/staff/api/orders/checkout", "/staff"),
    "/staff/api/orders/checkout",
  );
  assert.equal(appPath("/staff?return=order", "/staff"), "/staff?return=order");
  assert.equal(
    appPath("https://payments-web-sandbox.maya.ph/v2/checkout", "/staff"),
    "https://payments-web-sandbox.maya.ph/v2/checkout",
  );
  assert.equal(
    appPath("//external.example/path", "/staff"),
    "//external.example/path",
  );
});
