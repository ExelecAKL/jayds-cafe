import { mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "menu-products", "images");
const apps = process.argv[2] ? [process.argv[2]] : ["customer", "pos", "admin"];
if (apps.some((app) => !["customer", "pos", "admin"].includes(app)))
  throw new Error("Unknown app");
let files = [];
try {
  files = (await readdir(source)).filter((name) =>
    /^[a-z0-9-]+\.png$/.test(name),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const app of apps) {
  const destination = join(root, "apps", app, "public", "products");
  await mkdir(destination, { recursive: true });
  // The downloadable originals stay full resolution. App PNGs retain alpha and
  // use a smaller size to keep mobile menus quick to load.
  for (const file of files)
    await sharp(join(source, file))
      .resize({
        width: 768,
        height: 768,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
      .toFile(join(destination, file));
}
console.log(
  `Prepared ${files.length} transparent menu images for ${apps.join(", ")}.`,
);
