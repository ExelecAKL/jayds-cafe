# Jayds Café deployment and version control

Private repository: https://github.com/karaagexc/jayds-cafe

## Public entry points

| App | Public URL | Vercel project |
| --- | --- | --- |
| Customer | https://jaydscafe.vercel.app | jaydscafe |
| Cashier POS | https://jaydscafe.vercel.app/pos | jaydscafe-pos |
| Admin | https://jaydscafe.vercel.app/admin | jaydscafe-admin |

Customer proxies `/pos` and `/admin` to the respective deployments. POS and Admin retain their authentication and staff role checks. Their upstream URLs are `https://jaydscafe-pos.vercel.app` and `https://jaydscafe-admin.vercel.app`.

## Build settings

All three projects deploy from the repository root so the npm workspaces, shared package, brand assets, and preparation scripts are available. Use Node.js 24.x, Next.js, and `npm ci`.

| Project | Build command | Output directory | Additional environment |
| --- | --- | --- | --- |
| jaydscafe | npm run build -w apps/customer | apps/customer/.next | POS_UPSTREAM_URL and ADMIN_UPSTREAM_URL |
| jaydscafe-pos | npm run build -w apps/pos | apps/pos/.next | APP_BASE_PATH=/pos |
| jaydscafe-admin | npm run build -w apps/admin | apps/admin/.next | APP_BASE_PATH=/admin |

`vercel.json` sets the common framework. The three `vercel.<app>.json` files pin the build command and output for manual CLI deployments. Project dashboard settings must use the table above for Git deployments.

## Environment variables

Store credentials in Vercel environment variables, never in Git. The upload excludes local `.env` files, provider link files, database CLI state, test logs, and browser captures. `.env.example` contains placeholders.

All apps require `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Set `NEXT_PUBLIC_CUSTOMER_URL=https://jaydscafe.vercel.app`, `NEXT_PUBLIC_POS_URL=https://jaydscafe.vercel.app`, and `NEXT_PUBLIC_ADMIN_URL=https://jaydscafe.vercel.app/admin`.

Customer also requires its existing Maya and Lalamove credentials, courier pickup coordinates/address/phone, and any configured webhook secret. Keep `MAYA_ENV=sandbox` and `LALAMOVE_BASE_URL=https://rest.sandbox.lalamove.com` for the panel demo. A hosted production deployment does not switch providers to live payments or couriers.

Set Customer's `POS_UPSTREAM_URL=https://jaydscafe-pos.vercel.app`, `ADMIN_UPSTREAM_URL=https://jaydscafe-admin.vercel.app`, and allow the intended Customer/POS origins through `CUSTOMER_ALLOWED_ORIGINS`.

Supabase recovery/email sign-in redirects must permit the hosted Customer callback URL. Provider webhooks require the public HTTPS callback endpoints. Sandbox checkout creation alone does not verify a completed payment or incoming webhook.

## Save changes

```powershell
git status
git add .
git commit -m "Describe the change"
git push origin main
```

The first commit preserves the app baseline and migrations as of 7 October 2026. Keep feature work in separate branches when needed. Thesis Markdown, generators, and diagrams are versioned; generated Word/PDF drafts and rendered page images remain local.

## Deploy changes

With Vercel CLI authentication and project environment variables already configured:

```powershell
.\scripts\vercel-deploy-jaydscafe.ps1
```

This deploys POS, Admin, then Customer using explicit project names and configurations. It does not overwrite root configuration or pass credentials in command arguments. Use `-App customer`, `-App pos`, or `-App admin` to deploy one app. Use `-DryRun` to inspect the upload without deploying.

Git integration, when connected for all three projects, builds pushes to `main` using each project's build settings. Private GitHub visibility does not make the Customer storefront private; POS/Admin still require authorized staff authentication.

## Verify and recover

After deployment, check Customer menu, POS login, Admin login, static assets under both base paths, and rejection of unauthenticated sensitive API calls. Run authenticated order/payment checks only with approved test data. Do not reset or reseed the shared database.

Vercel keeps earlier deployments for rollback. Database migrations are separate from app deployments; reverting a Git commit does not undo applied schema or business transactions. See `docs/cash-at-pickup-verification-2026-10-07.md` for the latest payment/fulfillment checks and their limits.
