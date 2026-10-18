import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export async function extraCustomerAudit(
  page: Page,
  base: string,
  profile: { id: string; full_name: string; phone: string },
) {
  const out = path.resolve(
    (process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") +
      "/hosted-extra-customer",
  );
  mkdirSync(out, { recursive: true });
  const results: { feature: string; status: string; detail: string }[] = [];
  const writes: {
    name: string;
    method: string;
    body: Record<string, unknown>;
  }[] = [];
  const addresses: Record<string, unknown>[] = [];
  let failProfile = true,
    failAddress = true,
    failDelete = true;
  const profileMatcher = (url: URL) => url.pathname === "/rest/v1/profiles";
  const addressMatcher = (url: URL) =>
    url.pathname === "/rest/v1/saved_addresses";
  const locationMatcher = (url: URL) =>
    url.origin === new URL(base).origin && url.pathname === "/api/location";
  const originalProfile = { ...profile };
  await page.context().route(profileMatcher, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      writes.push({ name: "profiles", method: "PATCH", body });
      if (failProfile) {
        failProfile = false;
        return route.fulfill({
          status: 503,
          json: { message: "Injected profile failure" },
        });
      }
      Object.assign(profile, body);
    }
    await route.fulfill({ json: profile });
  });
  await page.context().route(addressMatcher, async (route) => {
    const method = route.request().method(),
      body = route.request().postDataJSON() ?? {};
    if (method !== "GET") {
      writes.push({ name: "saved_addresses", method, body });
      if (method === "POST" && failAddress) {
        failAddress = false;
        return route.fulfill({
          status: 503,
          json: { message: "Injected address failure" },
        });
      }
      if (method === "DELETE" && failDelete) {
        failDelete = false;
        return route.fulfill({
          status: 503,
          json: { message: "Injected remove failure" },
        });
      }
      if (method === "POST")
        addresses.push({ id: "90000000-0000-4000-8000-000000000001", ...body });
      if (method === "PATCH") Object.assign(addresses[0], body);
      if (method === "DELETE") addresses.splice(0);
    }
    await route.fulfill({ json: method === "GET" ? addresses : [] });
  });
  await page
    .context()
    .route(locationMatcher, (route) =>
      route.fulfill({
        json: {
          results: [
            {
              lat: 14.346621,
              lng: 120.981057,
              address: "Audit café destination",
            },
          ],
        },
      }),
    );
  async function check(feature: string, work: () => Promise<void>) {
    try {
      await work();
      results.push({
        feature,
        status: "PASS",
        detail: "Verified in Playwright with isolated writes",
      });
    } catch (e) {
      results.push({
        feature,
        status: "FAIL",
        detail: String(e).slice(0, 1600),
      });
      await page.screenshot({
        path: path.join(out, `${results.length}-failure.png`),
        fullPage: true,
      });
    }
    writeFileSync(
      path.join(out, "results.json"),
      JSON.stringify(
        { base, liveWrites: false, results, fixtureWriteCount: writes.length },
        null,
        2,
      ),
    );
  }
  try {
    await page.goto(base + "/profile/edit");
    await expect(
      page.getByLabel(/^Full name(?:\s*(?:\*|\(optional\)))?$/, {
        exact: true,
      }),
    ).toHaveValue(profile.full_name);
    await check(
      "profile: missing phone is required and cannot clear the saved contact",
      async () => {
        const before = writes.length;
        const phone = page.getByLabel(/Phone number/);
        await phone.fill("");
        await page
          .getByRole("button", { name: "Save details", exact: true })
          .click();
        await expect(phone).toBeFocused();
        assert.equal(
          await phone.evaluate(
            (input) => (input as HTMLInputElement).validity.valueMissing,
          ),
          true,
        );
        assert.equal(writes.length, before);
      },
    );
    await check("profile: invalid phone rejects without write", async () => {
      const before = writes.length;
      await page.getByLabel(/Phone number/).fill("bad-phone");
      await page
        .getByRole("button", { name: "Save details", exact: true })
        .click();
      await expect(
        page.getByText(
          "Enter a valid phone number so the delivery rider can contact you.",
        ),
      ).toBeVisible();
      assert.equal(writes.length, before);
    });
    await check("profile: failed save retains values", async () => {
      await page
        .getByLabel(/^Full name(?:\s*(?:\*|\(optional\)))?$/, { exact: true })
        .fill("Audit Customer");
      await page.getByLabel(/Phone number/).fill("0912 345 6789");
      await page
        .getByRole("button", { name: "Save details", exact: true })
        .click();
      await expect(
        page.getByText(
          "Your details could not be saved. Reconnect and try again.",
        ),
      ).toBeVisible();
      await expect(
        page.getByLabel(/^Full name(?:\s*(?:\*|\(optional\)))?$/, {
          exact: true,
        }),
      ).toHaveValue("Audit Customer");
    });
    await check("profile: retry saves normalized phone", async () => {
      await page
        .getByRole("button", { name: "Save details", exact: true })
        .click();
      await expect(page.getByText("Your details were saved.")).toBeVisible();
      assert.equal(writes.at(-1)?.body.phone, "09123456789");
      await page.reload();
      await expect(
        page.getByLabel(/^Full name(?:\s*(?:\*|\(optional\)))?$/, {
          exact: true,
        }),
      ).toHaveValue("Audit Customer");
    });
    await check(
      "password: mismatched confirmation blocks verification",
      async () => {
        await page
          .getByLabel(/^Current password(?:\s*(?:\*|\(optional\)))?$/, {
            exact: true,
          })
          .fill("FixtureOld1");
        await page
          .getByLabel(/^New password(?:\s*(?:\*|\(optional\)))?$/, {
            exact: true,
          })
          .fill("FixtureNew1");
        await page
          .getByLabel(/^Confirm new password(?:\s*(?:\*|\(optional\)))?$/, {
            exact: true,
          })
          .fill("DifferentNew1");
        await page
          .getByRole("button", { name: "Change password", exact: true })
          .click();
        await expect(
          page.getByText("The new passwords do not match."),
        ).toBeVisible();
      },
    );
    await check(
      "password: current-password verification failure retains entry",
      async () => {
        const matcher = (url: URL) => url.pathname === "/auth/v1/token";
        await page
          .context()
          .route(matcher, (route) =>
            route.fulfill({
              status: 400,
              json: {
                error: "invalid_grant",
                message: "Invalid login credentials",
              },
            }),
          );
        try {
          await page
            .getByLabel(/^Confirm new password(?:\s*(?:\*|\(optional\)))?$/, {
              exact: true,
            })
            .fill("FixtureNew1");
          await page
            .getByRole("button", { name: "Change password", exact: true })
            .click();
          await expect(
            page.getByText("Your current password could not be verified."),
          ).toBeVisible();
          await expect(
            page.getByLabel(/^Current password(?:\s*(?:\*|\(optional\)))?$/, {
              exact: true,
            }),
          ).toHaveValue("FixtureOld1");
        } finally {
          await page.context().unroute(matcher);
        }
      },
    );
    await check(
      "password: successful isolated change clears password fields",
      async () => {
        const matcher = (url: URL) => url.pathname === "/auth/v1/logout";
        await page
          .context()
          .route(matcher, (route) => route.fulfill({ status: 204, body: "" }));
        try {
          await page
            .getByRole("button", { name: "Change password", exact: true })
            .click();
          await expect(
            page.getByText("Your password was changed."),
          ).toBeVisible();
          await expect(
            page.getByLabel(/^Current password(?:\s*(?:\*|\(optional\)))?$/, {
              exact: true,
            }),
          ).toHaveValue("");
          await expect(
            page.getByLabel(/^New password(?:\s*(?:\*|\(optional\)))?$/, {
              exact: true,
            }),
          ).toHaveValue("");
        } finally {
          await page.context().unroute(matcher);
        }
      },
    );
    await page.goto(base + "/profile/addresses");
    await check("saved addresses: missing destination validation", async () => {
      await page
        .getByRole("button", { name: "Add address", exact: true })
        .click();
      await page
        .getByLabel(/^Label(?:\s*(?:\*|\(optional\)))?$/, { exact: true })
        .fill("Home");
      await page
        .getByRole("button", { name: "Save destination", exact: true })
        .click();
      await expect(
        page.getByText("Enter a label and choose a complete destination."),
      ).toBeVisible();
    });
    await check("saved addresses: map search and selection", async () => {
      await page
        .getByRole("button", { name: "Choose on map", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Delivery address" });
      await dialog
        .getByLabel(/^Complete delivery address/)
        .fill("Audit destination");
      await dialog
        .getByRole("button", { name: "Audit café destination", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Use this destination", exact: true })
        .click();
      await expect(
        page.getByLabel(/^Complete address(?:\s*(?:\*|\(optional\)))?$/, {
          exact: true,
        }),
      ).toHaveValue("Audit café destination");
    });
    await check(
      "saved addresses: save failure retains destination",
      async () => {
        await page
          .getByRole("button", { name: "Save destination", exact: true })
          .click();
        await expect(
          page.getByText(
            "Your address could not save. Your entries are retained.",
          ),
        ).toBeVisible();
        await expect(
          page.getByLabel(/^Label(?:\s*(?:\*|\(optional\)))?$/, {
            exact: true,
          }),
        ).toHaveValue("Home");
      },
    );
    await check("saved addresses: create and reload", async () => {
      await page
        .getByRole("button", { name: "Save destination", exact: true })
        .click();
      await expect(
        page.getByText("Address saved.", { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Home", exact: true }),
      ).toBeVisible();
    });
    await check("saved addresses: edit complete address", async () => {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page
        .getByLabel(/^Label(?:\s*(?:\*|\(optional\)))?$/, { exact: true })
        .fill("Office");
      await page
        .getByLabel(/^Complete address(?:\s*(?:\*|\(optional\)))?$/, {
          exact: true,
        })
        .click();
      const picker = page.getByRole("dialog", { name: "Delivery address" });
      await picker
        .getByLabel(/^Complete delivery address/)
        .fill("Audit café updated address");
      await picker
        .getByRole("button", { name: "Audit café destination", exact: true })
        .click();
      await picker
        .getByRole("button", { name: "Use this destination", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Save destination", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Office", exact: true }),
      ).toBeVisible();
    });
    await check(
      "saved addresses: cancel removal performs no write",
      async () => {
        const before = writes.length;
        await page.getByRole("button", { name: "Remove", exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        assert.equal(writes.length, before);
      },
    );
    await check(
      "saved addresses: remove failure and successful retry",
      async () => {
        await page.getByRole("button", { name: "Remove", exact: true }).click();
        await page
          .getByRole("button", { name: "Remove address", exact: true })
          .click();
        await expect(
          page.getByText("Address could not be removed. Please retry."),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Remove address", exact: true })
          .click();
        await expect(
          page.getByText("Address removed.", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Office", exact: true }),
        ).toHaveCount(0);
      },
    );
  } finally {
    Object.assign(profile, originalProfile);
    await page.context().unroute(profileMatcher);
    await page.context().unroute(addressMatcher);
    await page.context().unroute(locationMatcher);
  }
  console.log(JSON.stringify({ extraCustomerAudit: results }));
  return results;
}
