# ☕ CafeOS — PWA-based Online Ordering App System for a Cafe

Private source repository: [karaagexc/jayds-cafe](https://github.com/karaagexc/jayds-cafe).
Hosted entry points: [Customer](https://jaydscafe.vercel.app), [Cashier POS](https://jaydscafe.vercel.app/staff), and [Admin](https://jaydscafe.vercel.app/admin).
See [deployment and version control](docs/vercel-deployment.md) for publishing changes.

A **3-in-1 web system** built with **Next.js 16.3.8**, **Supabase**, and **Maya Business API** for a thesis project titled: *"The Development of a PWA-based Online Ordering App System for a Cafe"*

---

## 🏗️ System Architecture

| App | Description | Port | Access |
|-----|-------------|------|--------|
| **Customer PWA** | Mobile-first PWA for browsing menu, ordering, and tracking | `4000` | Public (customers) |
| **POS Terminal** | Staff-facing order management and payment processing | `4001` | Staff & Admin only |
| **Admin Panel** | Menu CRUD, order history, analytics, user management | `4002` | Admin only |

All three apps share **one Supabase backend** with row-level security. See [upgrade and configuration notes](docs/next16-upgrade.md) for the TypeScript migration, checks, and pending database configuration.

Jayds operations: [cashier POS guide](docs/pos-cashier.md), [inventory/Admin rollout](docs/inventory-operations.md), and [café database upgrade and preservation checks](docs/pos-database-rollout.md).

### DFD Reference

- [Jayds Cafe System DFD](docs/system-dfd.md)

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 16.3.8 (App Router) + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth + Realtime)
- **Payment:** Maya Business API (sandbox/production toggle)
- **PWA:** Serwist with a TypeScript service worker (customer app only)
- **State:** React Context + useReducer
- **Currency:** Philippine Peso (₱)
- **Language:** TypeScript throughout

---

## 📁 Monorepo Structure

```
cafeOS/
├── apps/
│   ├── customer/          ← PWA, port 4000
│   │   ├── app/           ← Next.js App Router pages
│   │   ├── components/    ← BottomNav, MenuCard
│   │   ├── context/       ← CartContext with localStorage
│   │   └── public/        ← manifest.json, icons
│   ├── pos/               ← POS terminal, port 4001
│   │   ├── app/           ← Dashboard (kanban), new order, payment
│   │   ├── components/    ← OrderCard
│   │   └── proxy.ts  ← Staff/admin auth guard
│   └── admin/             ← Admin panel, port 4002
│       ├── app/           ← Dashboard, orders, menu, categories, staff
│       ├── components/    ← Sidebar, MenuItemForm
│       └── proxy.ts  ← Admin-only auth guard
├── packages/
│   └── shared/            ← Shared code across all apps
│       └── src/
│           ├── supabase/  ← Browser + server clients
│           ├── hooks/     ← useAuth, useOrders, useMenu
│           ├── types/     ← All TypeScript types
│           └── maya.ts    ← Maya Business API service
├── supabase/
│   └── schema.sql         ← Full database schema + seed data
├── .env.example           ← All required env vars
├── package.json           ← npm workspaces root
└── README.md              ← This file
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 22.18+ (Node.js 24 recommended)
- npm 9+
- Supabase project (free tier works)
- Maya Business API sandbox account (optional for payment testing)

### 2. Clone & Install

```bash
git clone <repo-url>
cd cafeOS
npm install
```

### 3. Set Up Environment Variables

Copy `.env.example` to `.env.local` in **each app directory**:

```bash
cp .env.example apps/customer/.env.local
cp .env.example apps/pos/.env.local
cp .env.example apps/admin/.env.local
```

Fill in your Supabase and Maya credentials in each `.env.local`.

### 4. Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Open **SQL Editor**
3. Paste the contents of `supabase/schema.sql`
4. Run the SQL — this creates all tables, triggers, RLS policies, and seed data

### 5. Enable Realtime

In Supabase dashboard:
1. Go to **Database → Replication**
2. Enable realtime for: `orders`, `order_items`, `order_status_history`

### 6. Run All Apps

```bash
npm run dev
```

This starts all three apps concurrently:
- Customer: http://localhost:4000
- POS: http://localhost:4001
- Admin: http://localhost:4002

Or run individually:

```bash
npm run dev:customer
npm run dev:pos
npm run dev:admin
```

---

## 👤 Role System

| Role | Customer App | POS App | Admin Panel |
|------|-------------|---------|-------------|
| **customer** | ✅ Full access | ❌ Blocked | ❌ Blocked |
| **staff** | ✅ Full access | ✅ Full access | ❌ Blocked |
| **admin** | ✅ Full access | ✅ Full access | ✅ Full access |

Roles are assigned in the `profiles` table. New signups default to `customer`. Admins can reassign roles via the Admin Panel → Staff & Users page.

---

## 💳 Maya Payment Integration

### Sandbox Credentials (Pre-configured)

The `.env.example` already includes **public Maya sandbox keys** from the [official docs](https://developers.maya.ph/reference/sandbox-credentials-and-cards). These are shared by all developers for testing:

```env
NEXT_PUBLIC_MAYA_PUBLIC_KEY=your_maya_sandbox_public_key
MAYA_SECRET_KEY=your_maya_sandbox_secret_key
MAYA_ENV=sandbox
```

> ⚠️ These are **shared public sandbox keys**. Once you have a Maya Business Manager account, generate your own private sandbox keys for isolated testing.

### Test Cards (Sandbox Only)

Use these cards on the Maya checkout page during sandbox testing:

| Card | Number | Expiry | CVV | Result |
|------|--------|--------|-----|--------|
| **Visa (Success)** | `4123450131001381` | Any future date | Any 3 digits | `PAYMENT_SUCCESS` |
| **Visa (Failure)** | `4123450131001530` | Any future date | Any 3 digits | `PAYMENT_FAILED` |
| **Mastercard (Success)** | `5453010000095539` | Any future date | Any 3 digits | `PAYMENT_SUCCESS` |
| **Mastercard (Failure)** | `5453010000095547` | Any future date | Any 3 digits | `PAYMENT_FAILED` |

> Full list of mock cards: https://developers.maya.ph/page/full-list-of-mock-cards

### Webhook Setup

Maya sends payment notifications via webhook to confirm payment status.

1. Set up a public URL for your customer app (use ngrok for local dev):
   ```bash
   ngrok http 4000
   ```

2. In Maya dashboard, set webhook URL to:
   ```
   https://your-ngrok-url.ngrok.io/api/maya/webhook
   ```

3. Copy the webhook secret and add to `.env.local`:
   ```env
   ```

### Payment Flow

```
Customer places Maya order
  → Frontend calls /api/maya/checkout (server-side)
  → Server creates Maya checkout session
  → Customer redirected to Maya payment page
  → Maya processes payment
  → Maya sends POST to /api/maya/webhook
  → Webhook verifies signature
  → Updates orders.payment_status in Supabase
  → If PAYMENT_SUCCESS → order status → 'confirmed'
  → Supabase Realtime pushes update to all clients
```

---

## 📊 Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `profiles` | Extends auth.users with role, name, phone |
| `categories` | Menu categories (Drinks, Food, Pastries, Specials) |
| `menu_items` | Individual menu items with pricing, availability |
| `item_variants` | Sizes, sugar levels, add-ons for menu items |
| `orders` | Customer orders with status, payment info |
| `order_items` | Snapshot of items at time of order |
| `order_status_history` | Full audit trail of status changes |

### Triggers

- **on_auth_user_created** → Auto-creates profile on signup
- **on_order_status_change** → Auto-logs to order_status_history
- **generate_order_number()** → ORD-0001 format auto-generation
- **update_updated_at** → Auto-updates timestamps

### RLS Policies

- Customers: Can only read/write their own orders and profile
- Staff: Can read/write all orders, view all profiles
- Admin: Full access to all tables

---

## 📋 10-Day Development Checklist

| Day | Tasks |
|-----|-------|
| **Day 1** | Set up monorepo, install dependencies, configure Supabase project |
| **Day 2** | Run schema.sql, test seed data, verify RLS policies |
| **Day 3** | Build customer auth flow (login/register), test useAuth hook |
| **Day 4** | Build menu page, item detail page, implement cart context |
| **Day 5** | Build cart page, checkout flow (cash), order creation |
| **Day 6** | Integrate Maya API, build checkout + webhook flow |
| **Day 7** | Build POS dashboard (kanban), order status updates |
| **Day 8** | Build POS new order + payment pages |
| **Day 9** | Build Admin panel (dashboard, orders, menu CRUD, categories, staff) |
| **Day 10** | Testing, bug fixes, PWA manifest, deploy to Vercel |

---

## 🚢 Deployment (Vercel)

Each app can be deployed as a separate Vercel project:

1. **Customer:** Deploy from `apps/customer` with root directory set to `apps/customer`
2. **POS:** Deploy from `apps/pos` with root directory set to `apps/pos`
3. **Admin:** Deploy from `apps/admin` with root directory set to `apps/admin`

Set the same environment variables in each Vercel project, updating the URL variables for production.

---

## 📝 License

This project was developed as a thesis project. All rights reserved.
