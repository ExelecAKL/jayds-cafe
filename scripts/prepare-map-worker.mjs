import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// MapLibre 6's ESM worker cannot infer its sibling modules from a webpack
// chunk URL. Serve the installed distribution and its dependencies together.
const dist = dirname(fileURLToPath(import.meta.resolve("maplibre-gl")));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "apps/customer/public/maplibre");
mkdirSync(output, { recursive: true });
const pending = ["maplibre-gl-worker.mjs"],
  copied = new Set();
while (pending.length) {
  const file = pending.pop();
  if (copied.has(file)) continue;
  if (!/^maplibre-[\w-]+\.mjs$/.test(file))
    throw Error("Unexpected worker dependency");
  const source = readFileSync(join(dist, file), "utf8");
  copyFileSync(join(dist, file), join(output, file));
  copied.add(file);
  for (const match of source.matchAll(/from["']\.\/([^"']+\.mjs)["']/g))
    pending.push(match[1]);
}
copyFileSync(join(dist, "../LICENSE.txt"), join(output, "LICENSE.txt"));
console.log(
  `Prepared ${copied.size} installed MapLibre worker modules and licence.`,
);
