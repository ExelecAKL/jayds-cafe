# Vercel release — 7 October 2026

The three existing projects were deployed directly from this workspace through Vercel CLI. GitHub is a private version-control backup; Git-triggered deployment is intentionally not enabled.

- Private repository: https://github.com/karaagexc/jayds-cafe
- Deployed application commit: `4ed0eab14bbd8dcf0a1a0e2131ec2550c0d4ed85`
- Customer: https://jaydscafe.vercel.app
- Cashier: https://jaydscafe.vercel.app/staff
- Admin: https://jaydscafe.vercel.app/admin
- Legacy `/pos`, `/pos/login`, and `/pos/dashboard` redirect to their `/staff` equivalents.

## Deployment evidence

Vercel returned `READY`, assigned the production aliases, and reported the same Git commit for all three projects:

| Project | Deployment ID |
| --- | --- |
| jaydscafe | dpl_6MMyEes6gtBimzSUvuvVSADGPcHA |
| jaydscafe-pos | dpl_3bzHwNpnZLsjHPGNBTiwBSaPSsy5 |
| jaydscafe-admin | dpl_7A7U6pJV59PW3md3oRSgUzM7TciL |

The upload exclusion is anchored to the root database directory so it retains the shared Supabase browser/server modules. Native cashier fetch requests and Admin reconciliation requests include the configured app base path. Staff password recovery also retains `/staff/reset-password` rather than relying on a root callback.

## Verification

- All three hosted production builds completed.
- Workspace TypeScript checks and focused ESLint checks passed.
- Seven focused path/security/URL regression tests passed.
- 46 hosted HTTP checks passed: Customer pages, staff/Admin pages, scoped JavaScript and icons, old POS redirects, public branch projection, and rejection of unauthenticated sensitive requests.
- A browser loaded the live catalog with 52 published products, expanded Vanilla Milkshake successfully, and updated its price from PHP115 to PHP130 when selecting Large.
- Unauthenticated staff/Admin navigation was checked in a browser for redirection to the respective login pages.

These deployment checks did not create orders, take payments, book couriers, change stock, or rewrite loyalty balances. Previous transaction rehearsals are recorded in `cash-at-pickup-verification-2026-10-07.md` and `demo-verification-2026-10-07.md`.

## Credentials and limits

The user explicitly approved syncing existing app credentials into Vercel environment variables. Local environment files, CLI authentication state, test logs, browser captures, database links, and generated thesis drafts are excluded from Git. Example Maya credentials were replaced with placeholders before the initial push. A source scan found no matching local server secrets in the upload.

Maya and Lalamove remain in sandbox mode. Human Maya payment completion remains deferred. Fresh hosted settlement and provider webhook delivery were not exercised by this release check. Supabase email recovery redirect allowlists also need to include the intended hosted callbacks before relying on recovery emails.

The dependency audit reported 14 advisories, including two critical transitive build/CLI-tool dependencies (`shell-quote` and `tar`). They were recorded rather than applying a breaking framework/Tailwind upgrade during deployment; dependency remediation is a separate outstanding maintenance item. This release is not a claim that every dependency is free of advisories.

## Re-deploy

Run `scripts/vercel-deploy-jaydscafe.ps1` from PowerShell after saving and pushing changes. It deploys the current folder through CLI using explicit per-app configuration. It does not connect GitHub or copy secrets into command arguments.
