import { mkdirSync, writeFileSync } from "node:fs";
import {
  authEmailContent,
  authEmailTemplate,
} from "../packages/shared/src/email/templates";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token)
  throw new Error(
    "A private Supabase management access token is required to publish templates; alternatively paste the prepared HTML in the Supabase Email Templates dashboard.",
  );
const endpoint =
  "https://api.supabase.com/v1/projects/segzigvrcgxdjskfltju/config/auth";
async function request(method = "GET", body?: unknown) {
  const result = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!result.ok)
    throw new Error(
      `Auth template configuration returned ${result.status}; no response body was logged.`,
    );
  return result.json();
}
const before = await request();
if (!before.smtp_host || !before.smtp_admin_email)
  throw new Error(
    "Connect and verify custom SMTP before replacing live account templates. Survey settings were not changed.",
  );
const changes: Record<string, string> = {};
for (const kind of Object.keys(
  authEmailContent,
) as (keyof typeof authEmailContent)[]) {
  const template = authEmailTemplate(kind);
  changes[`mailer_subjects_${kind}`] = template.subject;
  changes[`mailer_templates_${kind}_content`] = template.html;
}
if (process.argv.includes("--apply")) {
  mkdirSync(".codex-logs", { recursive: true });
  writeFileSync(
    `.codex-logs/auth-email-before-${Date.now()}.json`,
    JSON.stringify(
      Object.fromEntries(
        Object.keys(changes).map((key) => [key, before[key] ?? null]),
      ),
      null,
      2,
    ),
  );
  await request("PATCH", changes);
  const after = await request();
  for (const [key, value] of Object.entries(changes))
    if (after[key] !== value)
      throw new Error(
        "Template verification did not match the prepared source.",
      );
}
console.log(
  JSON.stringify({
    templates: 6,
    applied: process.argv.includes("--apply"),
    emailsSent: 0,
    confirmationSettingChanged: false,
  }),
);
