import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  authEmailContent,
  authEmailTemplate,
} from "../packages/shared/src/email/templates";
const folder = path.resolve("supabase/email-templates");
mkdirSync(folder, { recursive: true });
for (const kind of Object.keys(
  authEmailContent,
) as (keyof typeof authEmailContent)[]) {
  const template = authEmailTemplate(kind);
  writeFileSync(path.join(folder, kind + ".html"), template.html + "\n");
}
const images = path.resolve("apps/customer/public/email");
mkdirSync(images, { recursive: true });
await sharp(readFileSync("apps/customer/public/brand/jayds-horizontal.svg"), {
  density: 288,
})
  .resize({ width: 624 })
  .png({ compressionLevel: 9 })
  .toFile(path.join(images, "jayds-logo.png"));
console.log(
  "Prepared six Jayds account email templates and an email-compatible PNG logo. No emails sent.",
);
