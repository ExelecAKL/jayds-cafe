// Read-only checks by default. --apply marks a verified setup ready; Admin still
// chooses whether to email future invoices. This script never sends an email.
import { createClient } from "@supabase/supabase-js";
import { invoiceMailConfig } from "../packages/shared/src/email/delivery";
const config = invoiceMailConfig(process.env),
  domainId = process.env.RESEND_SENDING_DOMAIN_ID;
if (
  !config ||
  !domainId ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.CUSTOMER_JOB_SECRET
)
  throw new Error(
    "Email setup is incomplete. Set the server-only provider, sender, domain ID, Supabase and worker credentials described in docs/email-delivery.md.",
  );
if (
  new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !==
  "segzigvrcgxdjskfltju.supabase.co"
)
  throw new Error("Unexpected project; review the deployment target.");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const setup = await db.rpc("invoice_email_worker_setup_status");
if (
  setup.error ||
  !setup.data?.cron_active ||
  !setup.data?.credential_configured
)
  throw new Error("The protected invoice worker is not ready.");
const senderDomain = config.from.match(/@([^<>]+)>$/)![1].toLowerCase();
const verification = await fetch(
  "https://api.resend.com/domains/" + encodeURIComponent(domainId),
  {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_SETUP_API_KEY || config.apiKey}`,
    },
    signal: AbortSignal.timeout(10000),
  },
);
if (!verification.ok)
  throw new Error(
    "Sender-domain verification could not be checked. Use a setup-only key with domain-read permission.",
  );
const domain = await verification.json();
if (
  domain.status !== "verified" ||
  String(domain.name).toLowerCase() !== senderDomain
)
  throw new Error(
    "The sending domain has not been verified for this sender address.",
  );
const runtime = await fetch(
  "https://jaydscafe.vercel.app/api/jobs/invoice-emails",
  {
    headers: { Authorization: `Bearer ${process.env.CUSTOMER_JOB_SECRET}` },
    signal: AbortSignal.timeout(10000),
  },
);
if (!runtime.ok) throw new Error("The deployed invoice worker is unavailable.");
const readiness = await runtime.json();
if (
  !readiness.configured ||
  String(readiness.senderDomain).toLowerCase() !== senderDomain
)
  throw new Error("Deploy the matching server-only sender settings first.");
if (process.argv.includes("--apply")) {
  const saved = await db.rpc("invoice_email_provider_ready", { p_ready: true });
  if (saved.error) throw new Error("Provider readiness could not be saved.");
}
console.log(
  JSON.stringify({
    verifiedSender: true,
    workerReady: true,
    applied: process.argv.includes("--apply"),
    emailsSent: 0,
    next: "Admin > Finance & invoices > Invoices > Email new invoices",
  }),
);
