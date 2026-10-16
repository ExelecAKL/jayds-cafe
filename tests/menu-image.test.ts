import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  MENU_IMAGE_LIMIT,
  prepareMenuImage,
  readMenuImage,
} from "../apps/admin/lib/menu-image.ts";

test("menu photos decode actual bytes, resize and remove embedded metadata", async () => {
  const original = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: "#986b4c" },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Artist: "Private camera owner" } } })
    .toBuffer();
  const output = await prepareMenuImage(original);
  const info = await sharp(output).metadata();
  assert.equal(info.format, "webp");
  assert.equal(info.width, 1600);
  assert.equal(info.height, 800);
  assert.equal(info.exif, undefined);
});
test("transparent photos stay transparent and unsupported or malformed files are rejected", async () => {
  const png = await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await sharp(await prepareMenuImage(png)).metadata()).hasAlpha,
    true,
  );
  for (const bytes of [
    Buffer.from("not an image"),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    ),
    Buffer.alloc(MENU_IMAGE_LIMIT + 1),
  ])
    await assert.rejects(prepareMenuImage(bytes));
});
test("uploads are bounded by actual bytes even if content-length is missing or false", async () => {
  const body = Buffer.alloc(MENU_IMAGE_LIMIT + 1);
  await assert.rejects(
    readMenuImage(
      new Request("http://fixture/upload", {
        method: "POST",
        body,
        headers: { "content-length": "12" },
      }),
    ),
    /5 MB/,
  );
  assert.deepEqual(
    await readMenuImage(
      new Request("http://fixture/upload", { method: "POST", body: "photo" }),
    ),
    Buffer.from("photo"),
  );
});
