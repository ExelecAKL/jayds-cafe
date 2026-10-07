# Local Supabase Demo Backup

The hosted Supabase project remains the normal source of truth. Keep the online Supabase values in each app's `.env.local`.

Local Supabase is only for demo backup or offline-ish development. It runs through Docker and is used only when you run the local-specific scripts.

## Normal Online Mode

Use the regular production-style script:

```powershell
npm run build:start
```

This uses the existing `.env.local` files in:

```text
apps/customer/.env.local
apps/pos/.env.local
apps/admin/.env.local
```

Those files should keep the online Supabase URL and keys.

If you are doing hot-reload development instead, `npm run dev` also uses the online `.env.local` files.

## Local Demo Mode

Start the local Supabase stack:

```powershell
npm run db:start
```

Reset and seed the local database on first setup, or whenever you want a fresh demo database:

```powershell
npm run db:reset
```

`db:reset` also seeds local demo auth accounts. If you only started an existing local database and need to re-apply the demo accounts, run:

```powershell
npm run db:seed-auth
```

Default local demo credentials:

```text
Admin: admin@cafeos.ph / JaydsAdmin123!
POS:   staff@cafeos.ph / JaydsStaff123!
```

To override the default password for a one-time local seed:

```powershell
$env:LOCAL_ADMIN_PASSWORD="your-admin-password"
$env:LOCAL_STAFF_PASSWORD="your-staff-password"
npm run db:seed-auth
```

Run all apps against local Supabase for this terminal process only in production-style mode:

```powershell
npm run build:start:local
```

Or start local Supabase and immediately run the production-style apps against it:

```powershell
npm run demo:local
```

For hot-reload development against local Supabase, use:

```powershell
npm run dev:local
```

`build:start:local` and `dev:local` read local credentials from:

```powershell
npm run db:env
```

Then it injects these values into the running Next.js processes:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

It does not edit or overwrite the online `.env.local` files.

## Local Migration Layout

Supabase CLI only applies migration files that match this format:

```text
<14-digit-timestamp>_name.sql
```

The active local migrations are in:

```text
supabase/migrations
```

Older manually named SQL scripts are preserved for reference in:

```text
supabase/legacy_migrations
```

The local seed runs in two steps:

```text
supabase/seed.sql
supabase/seed_recipes.sql
```

`seed.sql` creates the menu/demo data. `seed_recipes.sql` applies recipe and add-on mappings after the menu item IDs exist.

## Useful Local URLs

- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Local email inbox: `http://127.0.0.1:54324`

## Stop Local Supabase

```powershell
npm run db:stop
```
