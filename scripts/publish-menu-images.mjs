import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets", "menu-products");
const bucket = "jayds-menu-images";
const apply = process.argv.includes("--apply");
async function readEnv(files) {
  const env = {};
  for (const file of files) {
    try {
      for (const line of (
        await fs.readFile(path.join(root, file), "utf8")
      ).split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return env;
}
const base = await readEnv([".env", ".env.local"]);
const appEnvs = await Promise.all(
  ["customer", "pos", "admin"].map(async (app) => ({
    ...base,
    ...(await readEnv([`apps/${app}/.env`, `apps/${app}/.env.local`])),
  })),
);
const env = appEnvs[0];
assert.ok(
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
  "Configured server credentials required",
);
assert.equal(
  new Set(appEnvs.map((e) => e.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")))
    .size,
  1,
  "All three apps must share the same database",
);
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const manifest = JSON.parse(
  await fs.readFile(path.join(assets, "manifest.json"), "utf8"),
);
const prompts = JSON.parse(
  await fs.readFile(path.join(assets, "prompts.json"), "utf8"),
);
assert.equal(
  manifest.items.length,
  prompts.length,
  "Finish every product image before publishing",
);
const current = await db
  .from("menu_items")
  .select("id,name,image_url,is_available")
  .in(
    "id",
    manifest.items.map((item) => item.id),
  );
if (current.error) throw new Error(current.error.message);
assert.equal(
  current.data.length,
  manifest.items.length,
  "Every image must match a live menu item",
);
const byId = new Map(current.data.map((item) => [item.id, item]));
const prepared = [];
for (const item of manifest.items) {
  const live = byId.get(item.id);
  assert.equal(live.name, item.name, "Product ID/name mismatch");
  assert.match(item.slug, /^[a-z0-9-]+$/);
  assert.ok(
    !live.image_url ||
      live.image_url.includes(`/storage/v1/object/public/${bucket}/`),
    "An existing owner photo needs review before replacement: " + item.name,
  );
  const bytes = await fs.readFile(
    path.join(
      root,
      "apps",
      "customer",
      "public",
      "products",
      item.slug + ".png",
    ),
  );
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.hasAlpha, true);
  assert.ok(bytes.length < 5 * 1024 * 1024);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const objectPath = `generated/${item.id}/${item.slug}-${hash.slice(0, 12)}.png`;
  prepared.push({ item, live, bytes, hash, objectPath });
}
console.log(
  JSON.stringify({
    mode: apply ? "publish" : "read-only plan",
    items: prepared.length,
    bucket,
    backend: new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,
    apps: ["customer", "pos", "admin"],
  }),
);
if (!apply) process.exit(0);

const buckets = await db.storage.listBuckets();
if (buckets.error) throw new Error(buckets.error.message);
const existing = buckets.data.find((b) => b.id === bucket);
if (existing)
  assert.equal(
    existing.public,
    true,
    "Menu image bucket must already be public",
  );
else {
  const created = await db.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/png"],
  });
  if (created.error) throw new Error(created.error.message);
}

const published = [];
// Verify every uploaded PNG before changing any menu links. Hashed filenames
// make retries safe without overwriting files or relying on CDN invalidation.
for (const { item, live, bytes, hash, objectPath } of prepared) {
  const uploaded = await db.storage.from(bucket).upload(objectPath, bytes, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploaded.error && !/already exists/i.test(uploaded.error.message))
    throw new Error(
      `Upload failed for ${item.name}: ${uploaded.error.message}`,
    );
  const {
    data: { publicUrl },
  } = db.storage.from(bucket).getPublicUrl(objectPath);
  const response = await fetch(publicUrl);
  assert.ok(response.ok, `Public image unavailable: ${item.name}`);
  assert.ok(response.headers.get("content-type")?.includes("image/png"));
  const returned = Buffer.from(await response.arrayBuffer());
  assert.equal(
    createHash("sha256").update(returned).digest("hex"),
    hash,
    `Uploaded image differs: ${item.name}`,
  );
  published.push({
    id: item.id,
    name: item.name,
    slug: item.slug,
    bucket,
    path: objectPath,
    url: publicUrl,
    sha256: hash,
    bytes: bytes.length,
    previous_image_url: live.image_url,
    availability_before: live.is_available,
  });
  console.log(
    `Uploaded and verified ${published.length}/${prepared.length}: ${item.name}`,
  );
}
const publication = {
  published_on: new Date().toISOString(),
  bucket,
  items: published,
};
await fs.writeFile(
  path.join(assets, "publication.json"),
  JSON.stringify(publication, null, 2) + "\n",
);
for (let index = 0; index < published.length; index++) {
  const image = published[index];
  if (image.previous_image_url !== image.url) {
    let update = db
      .from("menu_items")
      .update({ image_url: image.url })
      .eq("id", image.id)
      .eq("name", image.name);
    update =
      image.previous_image_url == null
        ? update.is("image_url", null)
        : update.eq("image_url", image.previous_image_url);
    const linked = await update.select("id,image_url,is_available");
    if (linked.error)
      throw new Error(`Link failed for ${image.name}: ${linked.error.message}`);
    assert.equal(
      linked.data.length,
      1,
      `Menu item changed during upload: ${image.name}`,
    );
    assert.equal(linked.data[0].image_url, image.url);
    assert.equal(
      linked.data[0].is_available,
      image.availability_before,
      `Availability changed unexpectedly: ${image.name}`,
    );
  }
  console.log(`Linked ${index + 1}/${published.length}: ${image.name}`);
}
const final = await db
  .from("menu_items")
  .select("id,image_url,is_available")
  .in(
    "id",
    published.map((item) => item.id),
  );
if (final.error) throw new Error(final.error.message);
for (const image of published) {
  const row = final.data.find((item) => item.id === image.id);
  assert.equal(row?.image_url, image.url);
  assert.equal(row?.is_available, image.availability_before);
}
publication.verified_on = new Date().toISOString();
await fs.writeFile(
  path.join(assets, "publication.json"),
  JSON.stringify(publication, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    published: published.length,
    verified: final.data.length,
    sharedAcross: ["customer", "pos", "admin"],
  }),
);
