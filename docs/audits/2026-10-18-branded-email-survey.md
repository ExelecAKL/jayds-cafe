# Branded email and survey signup audit — 18 October 2026

Customer final source: `2765385768def171d55e4d793c23351db81a7643`. Admin source: `fa1876998602dc308d608c7bbc82f5065bb3a326`. POS source: `1f317d4ee077771784e7b5482e99e3b902dded76`. Separate existing local Admin edits were excluded from the clean release checkout.

## Live survey fix

The owner identified Create Account as the failing action. No custom email provider was configured. Supabase's built-in mailer allows two emails per hour, which is unsuitable for repeated participant verification messages. A designated-account password sign-in returned HTTP 200. The owner explicitly approved **temporarily disabling email confirmation** for survey registration; only `auth.email.enable_confirmations` was changed. Existing users were not bulk-confirmed, and Staff/Admin approval remains required.

A fresh, uniquely named temporary account registered with a session immediately and then signed back in with its password. No email was sent, and the temporary account was deleted. The hosted configuration now records that temporary choice, so URL configuration pushes preserve it. Signup connection exceptions release the busy state, and rate-limit feedback distinguishes unavailable email delivery from excessive connection requests.

This removes the confirmation-email dependency for new registrations. It does not remove IP protections or establish unlimited email delivery. Password reset and resend still require a suitable provider; their current provider limits remain applicable.

## Branded email feature

Six account templates cover signup confirmation, password reset, magic link, invitation, email change and reauthentication. They use the approved Jayds wordmark, cream/brown colors, email-compatible PNG artwork, readable text and one clear action. All Supabase confirmation/code placeholders are retained. Fourteen Chrome preview checks cover these six templates plus invoice email at 390 and 680 pixels; these are HTML previews, not certification of Outlook/Gmail mailbox rendering.

Invoice/credit-note delivery uses existing immutable invoice records and an authenticated View invoice / Save PDF link. The new database queue is future-only and opt-in: synthetic history, old sale events, guests without an account email and unavailable recipients are excluded. One row per invoice, frozen payloads, worker leases and stable provider idempotency keys bound retries. Ambiguous old attempts require review before the provider's deduplication window ends. Email failure never recalculates prices, reverses payment or issues another invoice.

Admin's Invoices tab shows connection state with a disabled activation button until a sender is verified. Approved Admin can enable or pause future email delivery. Failed status reads show Retry instead of an indefinite loading message. Invoice rows, recipient addresses, prepared email bodies and job credentials remain private.

**Current live state: invoice delivery disabled; provider not ready; pending 0; sent 0.** The cron job and protected Vault credential are configured. A disabled queue makes no delivery HTTP requests. No historical or synthetic invoices were queued, and no customer emails were sent by this release.

The account HTML templates are prepared but **not installed into live Supabase**. Provider/sender setup is still missing. Read-only CLI validation with dummy SMTP values did not alter the hosted mailer; its current template diff exposes subjects rather than HTML bodies. A separate guarded management-API publisher is provided for installing and verifying all six subject/body pairs after custom SMTP is configured. It preserves confirmation settings and sends no mail.

See [email setup and activation](../email-delivery.md). The prepared SMTP configuration restores confirmation only after a provider is connected and allows a configurable 60 Auth emails/hour. Provider limits still apply. No provider account, paid subscription or domain was purchased or created automatically.

## Verification

| Status | Check | Evidence |
| --- | --- | --- |
| PASS | Full backend regressions | 175 tests, zero failures |
| PASS | Final focused email coverage | Eight tests: HTML placeholders/escaping, issued amounts, provider errors, privacy, leases, frozen retries, future-only queue and owner rechecks |
| PASS | Hosted account forms | 16 checks, including immediate survey signup, confirmation/PKCE return, resend, phone validation, rate-limit feedback and recovery retry |
| PASS | Customer browser journeys | 55 isolated fixture products across nine viewport widths; no runtime errors |
| PASS | Password visibility | 12 fields across Customer, POS and Admin; pointer/keyboard, masking and value preservation |
| PASS | Admin and Customer invoices | Isolated issued POS invoice, Customer PDF view, setup feedback, expenses/reversals and three responsive widths; email status Retry, disabled/ready and enable/pause states |
| PASS | Real service worker | 141 public cached resources; offline reload/draft editing and reconnect preservation; no private cache entries |
| PASS | Build/type/lint | Customer local production build and all three Vercel builds READY; full workspace type checks; zero lint errors, one existing cleanup-ref warning |
| PASS | Hosted permissions and default state | Anonymous queue/worker access denied; logo loads; no queued/sent emails; cron and credential configured |
| FAIL | Unresolved release checks | None |
| BLOCKED | Actual email sending | Provider account, verified domain/sender and server credentials are not set up |
| NOT TESTED | Actual mailbox and phone handoff | Owner mailbox delivery, spam placement, real invoice arrival, installed-PWA opening and cross-browser proof-key behavior |

The initial offline test detected only the new public email-logo PNG as an unexpected cached path, not customer or invoice data. The final build excludes mail artwork from offline preload; the complete real-worker test then passed. The initial script type check required invoice data types to be moved out of the JSX document module; final type checks passed with compatible type re-exports.

The full Customer browser check ran against the `1f317d4` UI; later Customer source changes only exclude email artwork from service-worker preload and are covered by the final production build and real-worker check. The final focused email suite covers the added authenticated readiness GET. Physical phone, provider payment and delivery gates from prior audits remain unchanged.

## Publication and rollback

| App | Ready production deployment | Public URL |
| --- | --- | --- |
| Customer | `dpl_7SEJ3uKYvHtoDZQbdrrU9PSkQoJr` | https://jaydscafe.vercel.app |
| POS | `dpl_8bb679nby25i9bcYGCfC4yrMSbej` | https://jaydscafe-pos.vercel.app/staff/login |
| Admin | `dpl_4hVDjfg5jRFdDNxY7HQVzvEvKwR1` | https://jaydscafe-admin.vercel.app/admin/login |

Previous main `484c9075081bc0ff7ce249d39f8051729f864883` is preserved by `pre-branded-email-2026-10-18`. Application rollback does not undo the approved Supabase survey setting or database migration `20261018000200`; invoice sending remains separately disabled. Private config backups, preview PNGs and raw test output stay under ignored `.codex-logs/`. Sanitized results and raw-evidence hashes are recorded in [the evidence index](evidence/2026-10-18-branded-email.json).

References: [Supabase Auth limits](https://supabase.com/docs/guides/auth/rate-limits), [SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
