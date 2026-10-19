import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = new URL(
  "../apps/admin/design-system/tokens.json",
  import.meta.url,
);
const target = new URL(
  "../apps/admin/design-system/theme.css",
  import.meta.url,
);
const tokens = JSON.parse(readFileSync(source, "utf8"));
function emit(tree, prefix = "") {
  return Object.entries(tree).flatMap(([key, value]) => {
    if (key.startsWith("$")) return [];
    const name = prefix ? `${prefix}-${key}` : key;
    return "$value" in value
      ? [`  --ui-${name}: ${value.$value};`]
      : emit(value, name);
  });
}
const { semantic, dark, ...scales } = tokens;
const css = `/* Generated from tokens.json by scripts/build-admin-tokens.mjs. */\n:root {\n${[...emit(semantic), ...emit(scales)].join("\n")}\n}\n:root[data-theme="dark"] {\n${emit(dark).join("\n")}\n}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== css)
    throw new Error("Admin theme is out of date. Run npm run tokens:admin.");
  console.log("Admin theme matches its token source.");
} else {
  writeFileSync(target, css);
  console.log(`Built ${fileURLToPath(target)}`);
}
