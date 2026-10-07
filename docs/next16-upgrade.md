# Next.js 16 and TypeScript migration

Updated 2026-10-01. This changes the implementation of existing behavior; it does not redesign the screens or add product features.

## Runtime and tooling

- All three apps use Next.js 16.3.8 and React 19.3.0, the stable releases returned by the npm registry during this migration.
- Use Node.js 24 LTS, or at least Node.js 22.18.0. The workspace was checked with Node.js 24.16.0.
- Application code, Next/Tailwind configuration, maintenance scripts, and local runtime scripts are TypeScript. PostCSS uses its supported JSON configuration. Generated service workers and vendor assets remain JavaScript, as required by browsers.
- TypeScript 5.9.3 runs with strict checking. App builds no longer ignore TypeScript errors. ESLint runs separately through `npm run lint` because Next.js 16 removed `next lint` and build-integrated linting.
- Runtime scripts use `tsx`. Existing database maintenance scripts were converted, but were not executed against the hosted database.
- POS and admin use Turbopack. Customer explicitly uses webpack for Serwist's service worker integration, replacing the old `next-pwa` dependency. API, Supabase REST, and authentication requests bypass the service worker cache.
- Next configuration is typed, legacy middleware files are now `proxy.ts`, and the legacy item redirect awaits Next's asynchronous route parameters.

## Fixed issues

- Customer checkout calculates catalog prices, selected variant prices, voucher discounts, points, and totals on the server. Altered or stale client totals are rejected before an order is written.
- Delivery quotation responses carry a signed, expiring token bound to the amount and destination. The order API verifies it. Maya checkout includes delivery charges in its amount breakdown.
- Maya callbacks trigger an authenticated payment lookup. The payment ID, currency, and amount must match the stored order before updating it. Client-supplied callback payment status and metadata are never authoritative. Delayed callbacks cannot downgrade paid/refunded payments or reopen cancelled orders; conditional updates protect concurrent status changes.
- The old assumed `maya-signature`/`MAYA_WEBHOOK_SECRET` scheme has been removed. Maya Checkout's documentation describes network IP allowlisting rather than an HMAC header. Configure the published Maya IP allowlist at the deployment edge as well as keeping server-side payment verification enabled.
- Account-owned cancellations require the authenticated owner. Existing guest cancellation remains available. Cancelling a paid Maya order preserves its paid status and records that a manual refund is required; it no longer falsely claims a refund occurred. Cancellation does not execute a Maya refund.
- Menu data listens for catalog changes and refreshes after reconnect, focus, and periodic polling. Refreshes avoid replacing newer data with older responses or flashing the initial loader on each background update.
- Payment checkout logs no longer print secret-key prefixes or complete customer order records.

## Database and deployment

Apply `supabase/migrations/20261001000100_menu_realtime.sql` to the target Supabase project through your normal migration process. This idempotently adds menu items, categories, and variants to the realtime publication. It was **not applied to the hosted database** during this work. Periodic refresh is a fallback until the publication is updated.

Admin is the management interface. Supabase and the server API routes are the backend shared by customer, POS, and admin. Admin edits affect the shared records; realtime behavior still depends on the relevant subscriptions and database publication. It is not a universal API control plane for every setting.

Existing Vercel base paths and gateway rewrites remain. No deployment or provider-side webhook registration was performed. The local environment currently targets hosted Supabase and sandbox payment/delivery providers; passing a local build does not verify a real payment, refund, delivery booking, or authenticated browser journey.

## Checks

Run from the repository root:

```sh
npm run build
npm run typecheck
npm test
npm run check:http
npm run lint
```

Run build and typecheck sequentially: the build regenerates `.next/types`.

Production builds and TypeScript checks pass for the three apps, shared package, and migrated scripts. The backend regression suite passes 18 tests using fake data without loading `.env.local` or contacting payment/database services. All 23 HTTP checks pass. `check:http` starts and stops local production servers on ports 4140–4142, checking page responses, the legacy redirect, PWA assets, and rejected API requests. It does not use a browser or DOM, authenticate, or create orders.

Lint is not clean: the upgraded rules report 101 errors and 26 warnings, including legacy React effect/memoization patterns and explicit `any` types. Comparing each file with errors against its original source backup under the same rules found no increase in errors. These are preserved for review instead of broadly rewriting UI behavior or disabling the rules. The complete local report is `.codex-logs/next16-lint.json`, with the comparison in `.codex-logs/lint-baseline-comparison.json`.

No browser, DOM, or computer-use testing was performed. Original source backups are under `.codex-logs/before-fixes-2026-10-01/`; this workspace did not contain a Git repository.

## References

- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint)
- [Serwist with Next.js](https://serwist.pages.dev/docs/next/getting-started)
- [Maya Checkout webhook configuration](https://developers.maya.ph/reference/configuring-your-webhook-for-maya-checkout)
- [Maya payment retrieval](https://developers.maya.ph/reference/getpaymentviapaymentid-1)
