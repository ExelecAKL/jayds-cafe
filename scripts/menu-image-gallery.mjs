import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "menu-products",
);
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "manifest.json"), "utf8"),
);
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "prompts.json"), "utf8"),
);
const generated = new Map(manifest.items.map((item) => [item.slug, item]));
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const categories = [...new Set(catalog.map((item) => item.category))];
const cards = catalog
  .map((item) => {
    const asset = generated.get(item.slug);
    return `<article data-category="${escape(item.category)}" data-name="${escape(item.name.toLowerCase())}"><a class="preview" href="${escape(asset?.file || "#")}">${asset ? `<img src="${escape(asset.file)}" alt="${escape(item.name)}" loading="lazy" width="320" height="320">` : "<span>In progress</span>"}</a><div class="copy"><small>${escape(item.category)}${item.is_available ? "" : " · Coming soon"}</small><h2>${escape(item.name)}</h2><p>${escape(item.description)}</p>${asset ? `<a class="download" href="${escape(asset.file)}" download>Download PNG</a>` : ""}</div></article>`;
  })
  .join("\n");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jayd’s product image gallery</title><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#452816;background:#faf6f0}main{max-width:1400px;margin:auto;padding:32px 24px}h1{margin:0;font-size:clamp(28px,5vw,48px);letter-spacing:-.04em}header p{max-width:800px;color:#795d45}.toolbar{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}input,select{font:inherit;border:1px solid #d8c6b4;border-radius:12px;padding:12px;background:white;color:inherit}input{flex:1;min-width:220px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px}article{background:white;border:1px solid #e4d7c9;border-radius:20px;overflow:hidden}.preview{display:flex;align-items:center;justify-content:center;aspect-ratio:1;background-color:#f5f5f5;background-image:linear-gradient(45deg,#e5e5e5 25%,transparent 25%),linear-gradient(-45deg,#e5e5e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e5e5 75%),linear-gradient(-45deg,transparent 75%,#e5e5e5 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}.preview img{width:100%;height:100%;object-fit:contain}body[data-bg=cream] .preview{background:#f5e8d7}body[data-bg=dark] .preview{background:#2d1d15}body[data-bg=white] .preview{background:#fff}.copy{padding:18px}small{color:#926e50}h2{font-size:20px;margin:8px 0}.copy p{font-size:14px;color:#795d45;min-height:42px}.download{font-size:14px;font-weight:600;color:#8c4824}article[hidden]{display:none}footer{margin:28px 0;color:#795d45;font-size:14px}
</style><body data-bg="checker"><main><header><h1>Jayd’s, on the menu.</h1><p>${manifest.items.length} of ${catalog.length} transparent product PNGs. The mascot appears only on drink cups. Food gets a clean cutout.</p></header><div class="toolbar"><input id="search" type="search" placeholder="Find an item" aria-label="Find an item"><select id="category" aria-label="Category"><option value="">All categories</option>${categories.map((category) => `<option>${escape(category)}</option>`).join("")}</select><select id="background" aria-label="Preview background"><option value="checker">Transparency checker</option><option value="cream">Cream</option><option value="white">White</option><option value="dark">Espresso</option></select></div><section class="grid">${cards}</section><footer>Generated menu illustrations. Confirm portions, packaging, and base toppings with the café before treating them as exact serving photographs. Preview backgrounds are not part of the PNG files.</footer></main><script>
const search=document.getElementById('search'),category=document.getElementById('category');function filter(){for(const card of document.querySelectorAll('article'))card.hidden=(category.value&&card.dataset.category!==category.value)||!card.dataset.name.includes(search.value.trim().toLowerCase());}search.addEventListener('input',filter);category.addEventListener('change',filter);document.getElementById('background').addEventListener('change',event=>document.body.dataset.bg=event.target.value);
</script></body></html>`;
await fs.writeFile(path.join(root, "gallery.html"), html);
console.log(
  `Saved gallery with ${manifest.items.length}/${catalog.length} product images.`,
);
