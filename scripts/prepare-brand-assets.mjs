// Derive brand variants from the approved vector paths and shared icon masters.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const master = readFileSync(
  join(root, "assets/jayds-logo-transparent.svg"),
  "utf8",
);
const paths = master.match(/ d="([^"]+)"/)[1].split(/(?=M)/);
const shapes = JSON.parse(
  readFileSync(join(root, "packages/shared/src/brand/shapes.json"), "utf8"),
);
const ink = "#3e190f",
  cream = "#fbf5ee";
const outline = (data) =>
  `<path fill="currentColor" fill-rule="evenodd" d="${data.join("")}"/>`;
const glyph = (name) =>
  shapes[name]
    .map(
      (p) =>
        `<path d="${p.d}"${p.fill ? ` fill="${p.fill}"` : ""}${p.stroke ? ` stroke="${p.stroke}"` : ""}${p.fillRule ? ` fill-rule="${p.fillRule}"` : ""}${p.transform ? ` transform="${p.transform}"` : ""}/>`,
    )
    .join("");
const iconBody = (name) =>
  `<g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${glyph(name)}</g>`;
const svg = (
  body,
  width,
  height,
  color = ink,
  viewBox = `0 0 ${width} ${height}`,
) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" color="${color}" role="img" aria-label="Jayds Café">${body}</svg>\n`;
async function bounds(body) {
  const { data, info } = await sharp(Buffer.from(svg(body, 179, 255)), {
    density: 144,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] >= 16) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  return {
    x: left / 2,
    y: top / 2,
    width: (right - left + 1) / 2,
    height: (bottom - top + 1) / 2,
  };
}
async function cropped(body, padding = 2) {
  const box = await bounds(body);
  const width = Math.ceil(box.width + padding * 2),
    height = Math.ceil(box.height + padding * 2);
  return {
    width,
    height,
    body: `<g transform="translate(${padding - box.x} ${padding - box.y})">${body}</g>`,
  };
}
const textIndices = paths
  .map((d, i) => ({ i, numbers: d.match(/-?\d+(?:\.\d+)?/g).map(Number) }))
  .filter(
    ({ numbers }) => Math.min(...numbers.filter((_, i) => i % 2 === 0)) > 110,
  )
  .map(({ i }) => i);
const mascot = await cropped(
  outline(paths.filter((_, i) => !textIndices.includes(i))),
);
const wordmark = await cropped(
  outline(paths.filter((_, i) => textIndices.includes(i))),
);
// The stacked artwork joins S and E. Redraw these two as complete painted
// contours for the horizontal variant; cutting the join visibly slices them.
const completeS = `<path fill="currentColor" transform="translate(159 9) scale(.8)" d="M16.1 1.3C18.9 2.4 18.3 6 15.4 6.6C12.9 7.2 8.1 9.1 8.2 10.8C8.3 12.6 12.2 13.2 14.7 14.9C20.7 18.5 20.6 23.2 15.9 26.3C12.9 28.3 8.2 28.9 3.6 27.5C.8 26.7 1.4 22.2 4.6 22.6C8.8 23.5 12.9 22.8 12.7 20.9C12.5 19.4 8.7 18.6 5.9 16.5C-1 11.4 2.4 5.1 9.4 2.5C12.1 1.5 14.4.6 16.1 1.3Z"/>`;
const completeE = `<path fill="currentColor" transform="translate(160 30) scale(.8)" d="M4.4 3.2L15.9 1.3C18.3.9 19.1 5.5 16.9 6.1L8.8 7.7L9.3 11.1L14.6 10.3C17.8 9.8 18.4 14 15.4 14.9L10.2 15.9L10.9 19.7L18 18.6C21.3 18.1 21.9 23 18.5 23.6L8 25.5C4.9 26 3.2 24.5 2.8 21.5L.5 7.5C.1 5 1.4 3.7 4.4 3.2Z"/>`;
const upper = outline([2, 3, 4, 5, 6, 7].map((i) => paths[i])) + completeS;
const lower = outline([9, 10, 11, 14].map((i) => paths[i])) + completeE;
const upperBounds = await bounds(upper),
  lowerBounds = await bounds(lower);
const cap = 26,
  upperScale = cap / upperBounds.height,
  lowerScale = cap / lowerBounds.height;
const upperWidth = upperBounds.width * upperScale,
  lowerWidth = lowerBounds.width * lowerScale;
const horizontal = {
  width: Math.ceil(upperWidth + lowerWidth + 12),
  height: 32,
  body: `<g transform="translate(2 3) scale(${upperScale}) translate(${-upperBounds.x} ${-upperBounds.y})">${upper}</g><g transform="translate(${upperWidth + 10} 3) scale(${lowerScale}) translate(${-lowerBounds.x} ${-lowerBounds.y})">${lower}</g>`,
};
const lockup = {
  width: Math.ceil(horizontal.width * 1.6 + 62),
  height: 60,
  body: `<g transform="translate(2 1) scale(1.75)">${iconBody("mascot")}</g><g transform="translate(62 5) scale(1.6)">${horizontal.body}</g>`,
};
const variants = {
  full: { width: 179, height: 255, body: outline(paths) },
  wordmark,
  horizontal,
  lockup,
  mascot,
  symbol: { width: 32, height: 32, body: iconBody("mascot") },
  pin: {
    width: 48,
    height: 64,
    body: `<path fill="${ink}" d="M24 1C10.75 1 1 11.7 1 24c0 17 23 39 23 39s23-22 23-39C47 11.7 37.25 1 24 1Z"/><circle cx="24" cy="23" r="17" fill="${cream}"/><g transform="translate(10 8) scale(.875)">${iconBody("mascot")}</g>`,
  },
};
const exports = join(root, "assets/brand");
function renderVariant(name, asset, tone) {
  const body =
    name === "pin" && tone === "cream"
      ? asset.body
          .replaceAll(ink, "__ink__")
          .replaceAll(cream, ink)
          .replaceAll("__ink__", cream)
      : asset.body;
  return svg(body, asset.width, asset.height, tone === "cream" ? cream : ink);
}
mkdirSync(exports, { recursive: true });
const dimensions = {};
for (const [name, asset] of Object.entries(variants)) {
  dimensions[name] = { width: asset.width, height: asset.height };
  for (const tone of ["ink", "cream"]) {
    const filename = `jayds-${name}${tone === "cream" ? "-cream" : ""}.svg`;
    writeFileSync(join(exports, filename), renderVariant(name, asset, tone));
  }
}
for (const name of Object.keys(shapes))
  writeFileSync(join(exports, `icon-${name}.svg`), svg(iconBody(name), 32, 32));
writeFileSync(
  join(root, "packages/shared/src/brand/dimensions.json"),
  JSON.stringify(dimensions, null, 2) + "\n",
);
const rasterIcons = [
  ["jayds-app-192.png", 192, false],
  ["jayds-app-512.png", 512, false],
  ["jayds-maskable-512.png", 512, true],
  ["jayds-apple-180.png", 180, false],
  ["jayds-favicon-32.png", 32, false],
];
const raster = new Map();
for (const [name, size, maskable] of rasterIcons) {
  const artSize = maskable ? 288 : 380,
    offset = (512 - artSize) / 2;
  const body = `<rect width="512" height="512"${maskable ? "" : ' rx="104"'} fill="${cream}"/><g transform="translate(${offset} ${offset}) scale(${artSize / 32})">${iconBody("mascot")}</g>`;
  raster.set(
    name,
    await sharp(Buffer.from(svg(body, 512, 512)))
      .resize(size, size)
      .png()
      .toBuffer(),
  );
}
raster.set(
  "jayds-badge-96.png",
  await sharp(
    Buffer.from(svg(iconBody("mascot"), 96, 96, "#ffffff", "0 0 32 32")),
  )
    .png()
    .toBuffer(),
);
for (const app of ["customer", "pos", "admin"]) {
  const publicBrand = join(root, `apps/${app}/public/brand`),
    publicIcons = join(root, `apps/${app}/public/icons`);
  mkdirSync(publicBrand, { recursive: true });
  mkdirSync(publicIcons, { recursive: true });
  for (const [name, asset] of Object.entries(variants))
    for (const tone of ["ink", "cream"])
      writeFileSync(
        join(
          publicBrand,
          `jayds-${name}${tone === "cream" ? "-cream" : ""}.svg`,
        ),
        renderVariant(name, asset, tone),
      );
  for (const name of Object.keys(shapes))
    writeFileSync(
      join(publicBrand, `icon-${name}.svg`),
      svg(iconBody(name), 32, 32),
    );
  for (const [name, buffer] of raster)
    writeFileSync(join(publicIcons, name), buffer);
}
const rows = [
  ["Original signature", "full", 128],
  ["Wordmark", "wordmark", 112],
  ["Horizontal wordmark", "horizontal", 330],
  ["Compact lockup", "lockup", 330],
  ["Original mascot", "mascot", 98],
  ["Small symbol", "symbol", 104],
  ["Map pin", "pin", 72],
];
let sheet = `<rect width="1080" height="1140" fill="${cream}"/><text x="46" y="52" font-family="sans-serif" font-size="26" fill="${ink}">JAYDS · VECTOR BRAND SYSTEM</text>`;
rows.forEach(([label, name, displayWidth], i) => {
  const col = i % 3,
    row = Math.floor(i / 3),
    x = 46 + col * 345,
    y = 104 + row * 290,
    asset = variants[name],
    scale = displayWidth / asset.width;
  sheet += `<text x="${x}" y="${y}" font-family="sans-serif" font-size="15" fill="#755335">${label}</text><g color="${ink}" transform="translate(${x} ${y + 22}) scale(${scale})">${asset.body}</g>`;
});
sheet += `<rect x="350" y="684" width="680" height="182" rx="20" fill="${ink}"/><g color="${cream}" transform="translate(390 737) scale(2)">${lockup.body}</g><text x="46" y="982" font-family="sans-serif" font-size="17" fill="${ink}">Refined symbols · 24, 32 and 48 px</text>`;
Object.keys(shapes).forEach((name, i) => {
  const x = 46 + i * 127;
  [24, 32, 48].forEach((size, index) => {
    sheet += `<g color="${ink}" transform="translate(${x + (48 - size) / 2} ${1003 + index * 37}) scale(${size / 32})">${iconBody(name)}</g>`;
  });
});
await sharp(Buffer.from(svg(sheet, 1080, 1140)))
  .png()
  .toFile(join(exports, "jayds-brand-sheet.png"));
let refinementPreview = `<rect width="960" height="320" fill="${cream}"/><rect y="160" width="960" height="160" fill="${ink}"/>`;
for (const [row, color] of [
  [0, ink],
  [1, cream],
]) {
  const y = row * 160;
  refinementPreview += `<g color="${color}"><text x="32" y="${y + 32}" fill="currentColor" font-family="sans-serif" font-size="15">Horizontal wordmark · complete contours</text><g transform="translate(32 ${y + 56}) scale(2.8)">${horizontal.body}</g><text x="460" y="${y + 32}" fill="currentColor" font-family="sans-serif" font-size="15">Sipping mascot · 24 / 32 / 48 px</text><g transform="translate(460 ${y + 57}) scale(2.6)">${iconBody("mascot")}</g>`;
  for (const [index, size] of [24, 32, 48].entries())
    refinementPreview += `<g transform="translate(${600 + index * 100} ${y + 76 + (48 - size) / 2}) scale(${size / 32})">${iconBody("mascot")}</g>`;
  refinementPreview += `</g>`;
}
await sharp(Buffer.from(svg(refinementPreview, 960, 320)))
  .png()
  .toFile(join(exports, "jayds-refined-preview.png"));
console.log(
  `Prepared ${Object.keys(variants).length} vector variants, ${Object.keys(shapes).length} icons and ${raster.size} platform exports for all three apps.`,
);
