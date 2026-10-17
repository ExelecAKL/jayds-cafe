import test from "node:test";
import assert from "node:assert/strict";
import {
  menuProductImageSrcSet,
  menuProductImageUrl,
} from "../packages/shared/src/utils/product-images.ts";
test("only published generated WebP families advertise existing image sizes", () => {
  const url =
    "https://example.supabase.co/storage/v1/object/public/jayds-menu-images/generated/e3000000-0000-4000-a000-000000000001/vanilla-milkshake-123456789abc-640.webp";
  assert.equal(
    menuProductImageSrcSet(url),
    url.replace("-640.webp", "-320.webp") + " 320w, " + url + " 640w",
  );
  for (const original of [
    "/products/vanilla-milkshake.png",
    "https://photos.example/customer.webp",
    url + "?arbitrary=1",
    url.replace("640.webp", "640.png"),
    null,
  ])
    assert.equal(menuProductImageSrcSet(original), undefined);
  assert.equal(
    menuProductImageUrl("unknown", url),
    url,
    "Owner-supplied photos remain authoritative",
  );
});
