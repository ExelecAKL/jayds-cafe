# Jayds account and invoice email delivery

## Current state

Signup email confirmation is **temporarily disabled**, explicitly approved by the owner during the 18 October 2026 survey. A real temporary account registered with an immediate session and signed back in successfully, then was removed. Existing accounts were not bulk-confirmed. Passwords, approved Staff/Admin access and all other account protections remain required.

There is no configured custom mail provider or verified sending domain yet. The six branded account templates are prepared, **not installed into the live Supabase mailer**. Invoice delivery is implemented with a private queue and defaults to **off**. No customer emails, historical invoices or synthetic history are sent by this release. Password-reset/resend mail still depends on the current provider's limits; there is no claim of unlimited email delivery.

## Branding and documents

`npm run prepare:emails` generates six HTML templates under `supabase/email-templates/` and an email-compatible PNG at `apps/customer/public/email/jayds-logo.png`. The approved wordmark, warm cream/brown palette, persistent text and single main action are used throughout. Supabase's `ConfirmationURL` and verification-code placeholders are preserved.

Invoice/credit-note emails render the immutable issued invoice, including the invoice number, buyer, item quantities, VAT-inclusive amounts, discounts, VAT, delivery and total. The button opens the existing owner-authorized invoice page, where the user can view or save a PDF. It does not put an access/receipt token in the email or expose a public invoice URL. A refund credit note identifies its original invoice. No current menu prices are used to recalculate an issued document.

## Connect a verified sender

1. Set up a transactional email provider and verify a domain you control. The invoice adapter supports Resend; Supabase account mail supports the provider's SMTP service. No new provider account, paid plan or domain purchase was made automatically. Disable link tracking for account emails so verification URLs remain intact.
2. Add `RESEND_API_KEY` and `INVOICE_EMAIL_FROM` to the **Customer server's** environment in Vercel. The sender format is `Jayds Café <receipts@your-verified-domain>`. Use a sending-only runtime key. Preserve the existing `CUSTOMER_JOB_SECRET` and its Vault configuration. Redeploy Customer after changing its environment.
3. In a private local environment, set the same server values plus `RESEND_SENDING_DOMAIN_ID`, the hosted Supabase URL and service-role key. If the sending key cannot read domains, use a setup-only `RESEND_SETUP_API_KEY` with domain-read permission locally; do not deploy that setup key. `scripts/connect-invoice-email.ts` checks the verified domain, actual deployed sender, worker authentication, cron and Vault before it can mark the provider ready. It sends no email.

```powershell
# Read-only readiness check; load a private environment file with these values.
node --env-file=apps/customer/.env.local --import tsx scripts/connect-invoice-email.ts
# Save readiness only after every check passes. No invoices are backfilled.
node --env-file=apps/customer/.env.local --import tsx scripts/connect-invoice-email.ts --apply
```

4. In Admin > Finance & invoices > Invoices, select **Email new invoices**. Only invoices for valid sales created after activation are queued. Pause stops delivery; re-enabling begins a new future-only window. Enabling does not send historical or synthetic invoices. Guest orders without an account email retain their in-app invoice access.
5. Configure the account-mail SMTP values locally: `JAYDS_SMTP_HOST`, `JAYDS_SMTP_USER`, `JAYDS_SMTP_PASSWORD`, `JAYDS_SMTP_FROM_ADDRESS`. The prepared configuration uses TLS port 465; adjust the port for the chosen provider. Review `supabase/hosted-mail/supabase/config.toml` before applying. It restores email confirmation and sets a 60-email/hour Auth allowance after custom SMTP is configured. Adjust that allowance to the provider's actual plan and survey volume; the provider's own quotas still apply.

```powershell
npx supabase config diff --project-ref segzigvrcgxdjskfltju --workdir supabase/hosted-mail
npx supabase config push --project-ref segzigvrcgxdjskfltju --workdir supabase/hosted-mail
```

6. Publish the six HTML bodies too. The current CLI's config diff only exposes template subjects, so do not treat a successful config push as proof that branded HTML was installed. Paste each prepared HTML file into Supabase > Authentication > Email Templates, or run the management-API publisher below with a private `SUPABASE_ACCESS_TOKEN`. It checks for custom SMTP, backs up only the previous templates privately, changes the twelve subject/body fields and reads them back; it does not change confirmation or send emails.

```powershell
node --env-file=apps/customer/.env.local --import tsx scripts/publish-auth-email-templates.ts
node --env-file=apps/customer/.env.local --import tsx scripts/publish-auth-email-templates.ts --apply
```

7. After a real owner-controlled mailbox receives and completes signup/reset links, change `auth.email.enable_confirmations` back to `true` in `supabase/hosted-auth/supabase/config.toml` too, so future URL-only configuration pushes cannot restore survey mode. Verify actual invoice arrival, spam placement and PDF access with a controlled paid order. Existing device/provider checks remain separate gates.

## Delivery behavior

- The invoice insert and queue entry share the payment transaction. One queue row is allowed per issued invoice/credit note. The trigger does nothing while delivery is disabled; it never backfills existing rows.
- Synthetic history, guest/no-email purchases, old financial events and unconfirmed/deleted/banned accounts are excluded. Recipient email and order ownership are checked again immediately before sending.
- Approved Admin can view counts and pause/enable future delivery. Queue rows, recipient addresses, rendered payloads and worker operations are not exposed to customer/Staff database access. Readiness changes require the service role.
- The existing protected Vault job credential authenticates a separate minute worker. No secret is stored in a cron command or sent to the browser. When delivery is off, the cron function makes no HTTP request.
- A payload is frozen before first delivery. Retries use the same provider idempotency key and body; concurrent workers use expiring leases. Six-attempt and exponential-backoff limits apply. Ambiguous requests older than 20 hours go to review before Resend's 24-hour deduplication window expires. A failed email never reverses payment or issues another invoice.
- Logs and API responses report counts and generic failure classes, not invoice bodies, recipient addresses, tokens or provider response bodies. Provider-accepted messages are recorded as sent; actual inbox delivery/bounce tracking is not yet certified.

References: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [account email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
