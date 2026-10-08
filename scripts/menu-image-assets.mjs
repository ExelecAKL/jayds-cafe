import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";

const root = path.resolve("assets/menu-products");
const images = path.join(root, "images");
const manifestFile = path.join(root, "manifest.json");
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = async (file, data) =>
  fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
const [command, ...args] = process.argv.slice(2);
await fs.mkdir(images, { recursive: true });
let manifest;
try {
  manifest = await readJson(manifestFile);
} catch {
  manifest = {
    created_on: "2026-10-08",
    tool: "built-in imagegen",
    format: "transparent PNG",
    items: [],
  };
}

async function inspect(file) {
  const meta = await sharp(file).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.hasAlpha, true);
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let clear = 0,
    solid = 0,
    x1 = info.width,
    y1 = info.height,
    x2 = 0,
    y2 = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (a === 0) clear++;
      if (a >= 240) solid++;
      if (a >= 32) {
        x1 = Math.min(x1, x);
        y1 = Math.min(y1, y);
        x2 = Math.max(x2, x);
        y2 = Math.max(y2, y);
      }
    }
  assert.ok(
    clear > info.width * info.height * 0.08,
    "PNG must have a truly transparent background",
  );
  assert.ok(
    solid > info.width * info.height * 0.03,
    "PNG must retain a visible product",
  );
  return {
    width: info.width,
    height: info.height,
    transparent_fraction: Number(
      (clear / (info.width * info.height)).toFixed(4),
    ),
    subject_bounds: { x1, y1, x2, y2 },
    bytes: (await fs.stat(file)).size,
  };
}

if (command === "record") {
  const [slug, source] = args;
  assert.match(slug, /^[a-z0-9-]+$/);
  const entries = await readJson(path.join(root, "prompts.json"));
  const entry = entries.find((x) => x.slug === slug);
  assert.ok(entry, "Known product required");
  const resolved = path.resolve(source);
  const generatedRoot = path.resolve(
    process.env.USERPROFILE || "C:/Users/Exelec",
    ".codex/generated_images",
  );
  assert.ok(
    resolved.toLowerCase().startsWith(generatedRoot.toLowerCase() + path.sep),
    "Expected built-in generated image output",
  );
  const destination = path.join(images, slug + ".png");
  try {
    await fs.access(destination);
    throw new Error(
      "Asset already exists; use a new version before replacement",
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  // Lossless PNG encoding only; alpha and generated artwork are preserved.
  await sharp(resolved)
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toFile(destination);
  const verification = await inspect(destination);
  manifest.items.push({
    id: entry.id,
    name: entry.name,
    category: entry.category,
    slug,
    file: "images/" + slug + ".png",
    is_available: entry.is_available,
    description: entry.description,
    prompt: entry.prompt,
    source_file: resolved,
    verification,
  });
  await writeJson(manifestFile, manifest);
  console.log(
    JSON.stringify({ saved: slug, count: manifest.items.length, verification }),
  );
} else if (command === "status") {
  const prompts = await readJson(path.join(root, "prompts.json"));
  const done = new Set(manifest.items.map((x) => x.slug));
  console.log(
    JSON.stringify({
      done: done.size,
      total: prompts.length,
      pending: prompts
        .filter((x) => !done.has(x.slug))
        .map((x) => ({ slug: x.slug, name: x.name, category: x.category })),
    }),
  );
} else if (command === "verify") {
  const prompts = await readJson(path.join(root, "prompts.json"));
  assert.equal(manifest.items.length, prompts.length);
  assert.equal(new Set(manifest.items.map((x) => x.id)).size, prompts.length);
  for (const item of manifest.items) await inspect(path.join(root, item.file));
  console.log(
    JSON.stringify({
      verified: manifest.items.length,
      totalBytes: manifest.items.reduce((n, x) => n + x.verification.bytes, 0),
    }),
  );
} else if (command === "sheet") {
  const group = args[0] || "all";
  const selected = manifest.items.filter(
    (x) => group === "all" || x.category === group || x.slug === group,
  );
  assert.ok(selected.length);
  const cols = 4,
    cellW = 270,
    cellH = 310,
    rows = Math.ceil(selected.length / cols);
  const composites = [];
  for (let i = 0; i < selected.length; i++) {
    const item = selected[i],
      left = (i % cols) * cellW,
      top = Math.floor(i / cols) * cellH;
    const thumb = await sharp(path.join(root, item.file))
      .resize(240, 245, { fit: "inside" })
      .toBuffer();
    const meta = await sharp(thumb).metadata();
    composites.push({
      input: thumb,
      left: left + Math.round((cellW - meta.width) / 2),
      top: top + 10 + Math.round((245 - meta.height) / 2),
    });
    const title = item.name.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const svg = `<svg width="270" height="55"><text x="135" y="24" text-anchor="middle" font-family="Arial" font-size="14" fill="#3e190f">${title}</text><text x="135" y="44" text-anchor="middle" font-family="Arial" font-size="11" fill="#8c6950">${item.category}</text></svg>`;
    composites.push({ input: Buffer.from(svg), left, top: top + 255 });
  }
  await fs.mkdir(path.join(root, "previews"), { recursive: true });
  const output = path.join(
    root,
    "previews",
    group.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png",
  );
  await sharp({
    create: {
      width: cols * cellW,
      height: rows * cellH,
      channels: 4,
      background: "#f7efe6",
    },
  })
    .composite(composites)
    .png()
    .toFile(output);
  console.log(output);
} else throw new Error("Use record, status, verify or sheet");
