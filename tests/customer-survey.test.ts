import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidRegistrationPhone,
  registrationPhoneInput,
  isValidContactPhone,
} from "../packages/shared/src/customer/phone.ts";
import { passwordStrength } from "../apps/customer/utils/passwordStrength.ts";
import { outletIsOpen } from "../apps/customer/utils/outletHours.ts";
import { estimateOrderPoints } from "../apps/customer/utils/orderPoints.ts";

test("order points preview follows paid-completion tiers and never promises guest rewards", () => {
  assert.equal(estimateOrderPoints(134, "Bronze", true), 13);
  assert.equal(estimateOrderPoints(134, "Silver", true), 15);
  assert.equal(estimateOrderPoints(134, "Gold", true), 19);
  assert.equal(estimateOrderPoints(187, "Bronze", true), 18);
  assert.equal(estimateOrderPoints(9.99, "Bronze", true), 1);
  assert.equal(estimateOrderPoints(0, "Bronze", true), 1);
  assert.equal(estimateOrderPoints(100, "Gold", false), 0);
  assert.equal(estimateOrderPoints(NaN, "Bronze", true), 0);
});

test("registration caps digits at eleven and normalizes a formatted Philippine country-code paste", () => {
  assert.equal(registrationPhoneInput("091234567890123"), "09123456789");
  assert.equal(registrationPhoneInput("+63 (912) 345-6789"), "09123456789");
  assert.equal(registrationPhoneInput("09a12 345 6789"), "09123456789");
  assert.equal(registrationPhoneInput(""), "");
  for (const value of ["09123456789", "09999999999"])
    assert.equal(isValidRegistrationPhone(value), true);
});

test("outlet status respects Philippine dates, exact closing boundaries, multiple windows and closure dates", () => {
  const branch = {
    hours: [
      { weekday: 0, opens: "08:00", closes: "12:00" },
      { weekday: 0, opens: "13:00", closes: "22:00" },
    ],
    closures: [] as string[],
  };
  assert.equal(outletIsOpen(branch, new Date("2026-10-18T00:00:00Z")), true);
  assert.equal(outletIsOpen(branch, new Date("2026-10-18T04:00:00Z")), false);
  assert.equal(outletIsOpen(branch, new Date("2026-10-18T05:00:00Z")), true);
  assert.equal(outletIsOpen(branch, new Date("2026-10-18T14:00:00Z")), false);
  assert.equal(outletIsOpen(branch, new Date("2026-10-18T17:00:00Z")), false);
  assert.equal(
    outletIsOpen(
      { ...branch, closures: ["2026-10-18"] },
      new Date("2026-10-18T05:00:00Z"),
    ),
    false,
  );
  assert.equal(outletIsOpen({ hours: [], closures: [] }), null);
  assert.equal(outletIsOpen(null), null);
});

test("registration validation rejects bypassed length and non-mobile numbers without restricting existing delivery contact formats", () => {
  for (const value of [
    "",
    "0912345678",
    "091234567890",
    "08123456789",
    "0912345678x",
    "+639123456789",
    "12345678901",
  ])
    assert.equal(isValidRegistrationPhone(value), false);
  assert.equal(isValidContactPhone("+639123456789"), true);
  assert.equal(isValidContactPhone("09123456789"), true);
});

test("password strength progresses from one weak bar through two medium bars to three strong bars", () => {
  assert.equal(passwordStrength(""), 0);
  assert.equal(passwordStrength("abc"), 1);
  assert.equal(passwordStrength("Short1A"), 1);
  assert.equal(passwordStrength("Abcdefg1"), 2);
  assert.equal(passwordStrength("Abcdefgh1234"), 3);
  assert.equal(passwordStrength("ABCDEFGHIJKL"), 1);
  assert.equal(passwordStrength("abcdefgh1234"), 2);
});
