# Signup confirmation return — 18 October 2026

Application source: `51c78a57649422a3962a54ca48b200f84a8f7e50`.

The hosted Supabase project still had `http://localhost:3000` as its Site URL and no additional redirect URLs. Initial signup omitted `emailRedirectTo`, and hosted resend/recovery paths were absent from the allowlist. This sent phone confirmation links to the phone's localhost address.

Signup now explicitly returns to the requesting origin's login path, including `/staff` when mounted there. A Customer session established by the confirmation callback proceeds to Home. Supabase's default is now `https://jaydscafe.vercel.app/login`, with ten exact Customer, Staff and Admin login/recovery paths allowed across their public domains. No production localhost or wildcard redirects were added.

Only `auth.site_url` and `auth.additional_redirect_urls` changed remotely. Email confirmations, SMTP, MFA, rate limits, database and storage settings were preserved. A fresh config diff confirmed zero remaining declared changes. The URL-only configuration lives in [the hosted auth configuration](../../supabase/hosted-auth/supabase/config.toml); local `supabase/config.toml` remains for the local Supabase stack. Do not push the local development config to production.

To inspect or reapply the URL-only configuration with the authenticated CLI:

```powershell
npx supabase config diff --project-ref segzigvrcgxdjskfltju --workdir supabase/hosted-auth
npx supabase config push --project-ref segzigvrcgxdjskfltju --workdir supabase/hosted-auth
```

| Status | Check | Result |
| --- | --- | --- |
| PASS | Real Supabase confirmation | A temporary signup was confirmed through Supabase's verification endpoint and redirected to the hosted login page. An unapproved external redirect fell back to the same hosted page. No email was sent; the temporary account was deleted. |
| PASS | Hosted browser forms | 15 checks across Customer and Staff, including signup URLs, resend, PKCE exchange and automatic Customer return to Home, required phone, retry preservation and reset URLs. Auth/email writes were intercepted. |
| PASS | Production builds | Customer and POS deployments both READY in Vercel production; explicit public aliases updated. |
| PASS | Type checks and lint | Full workspace type checks; zero lint errors and one existing cleanup-ref warning. |
| FAIL | Unresolved release checks | None. |
| NOT TESTED | Physical email handoff | Actual Gmail/mailbox delivery, OS handoff to an installed PWA and cross-browser session sharing require the phone/mailbox. |

The first local build hit a sandbox `EPERM` creating a generated `.next/types` directory. Vercel subsequently built the same source successfully. A first alias command used an unsupported `--yes` option; rerunning with supported syntax succeeded. Neither failure changed the hosted source.

Customer deployment: `dpl_EFUmowLzdqtr9qQw3vd1FajX3kiS`, public URL [jaydscafe.vercel.app](https://jaydscafe.vercel.app). POS deployment: `dpl_CNARTtkNrpXhZ3G9PZZMYvPzQMRE`, public URL [jaydscafe-pos.vercel.app/staff/login](https://jaydscafe-pos.vercel.app/staff/login).

Prior main `95df2800a4c1f84baa18a984ef4494696d5dc6bc` is preserved by `pre-signup-return-2026-10-18`. Application rollback does not undo the separate Supabase URL correction. Before/after config and raw evidence remain private under ignored `.codex-logs/signup-auth-config/` and `.codex-logs/2026-10-18-signup-*`.

For survey participants, refresh the app and request a fresh verification email from the Check Email screen, then use the newest link. If the old link already confirmed the email, sign in normally. Opening the email in another browser can require signing in because PKCE proof belongs to the browser that started signup.

Reference: [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).
