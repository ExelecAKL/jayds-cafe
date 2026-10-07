# Thesis Panel Audit Report

Repo: `c:\Users\Exelec\Downloads\pwajaydsmobilesokpos`  
Audit date: `2026-04-21`  
Audit mode: strict thesis-panel review  
Scope: customer app, POS app, admin app, shared code, API routes, Supabase SQL, and migrations

## Section 1: Executive Summary for Panel Defense

This project is no longer just a simple online ordering app. In its current form, it is an **ordering-centered cafe operations system** with three major fronts:

- customer ordering and payment
- POS fulfillment and walk-in handling
- admin operations for catalog, inventory, vouchers, staff, loyalty, and analytics

That is defensible, but only if it is framed honestly. The strongest panel risk is not that the system is weak. The strongest risk is that the **repo tells multiple different stories at once**:

- the `README.md` still frames the project as a simpler ordering app and still points setup to `supabase/schema.sql`
- the active runtime logic has moved beyond that into `master_setup.sql` plus later migrations
- several run6 and run7 features exist in code and migrations, but are only partially adopted across pages, policies, and data models

### Overall defense readout

| Area | Readout | Why panelists will care |
| --- | --- | --- |
| Ordering core | Strong but uneven | Customer browse/cart/checkout/order tracking exists and POS order progression exists, but some paths are partial |
| Payment | Partially complete | Maya checkout works for customer, but refund/void is not actually integrated with Maya |
| POS | Functional but mixed | Cash flow is real, walk-in flow exists, QR void/pickup exists, but POS Maya path is incomplete |
| Admin | Broad and impressive | Inventory, loyalty, staff, analytics, vouchers exist, but this broadens scope beyond a plain ordering app |
| Database | Powerful but drifted | Multiple schema sources and rollback migrations create uncertainty about what the authoritative design really is |
| Security | Mixed | RLS exists, but hardening and rollback migrations conflict, and some server routes use capability-style access that needs justification |

### Top panel risks in one screen

1. **Refunds are not real provider refunds.** The system marks Maya orders as `refunded` internally, but does not call a real Maya refund endpoint.
2. **POS Maya flow is incomplete.** POS allows `payment_method = maya`, but the POS payment page only waits for payment and does not create a checkout session.
3. **Schema authority is unclear.** `README.md` points to `schema.sql`, while current behavior depends on `master_setup.sql` and later migrations.
4. **Run6/run7 adoption is uneven.** Types and some routes support `pickup`, `delivery`, `clock_entries`, `notifications`, and `voucher_claims`, but several pages and docs still reflect the older model.
5. **Security migrations conflict with each other.** `security_hardening.sql` tightens protections, but `run8_relax_security.sql` explicitly rolls parts of that back.

## Section 2: Critical Findings by Severity

### Critical Defense Risk

#### Finding C1: Maya refunds are simulated internally, not executed against Maya

- **Panel question:** "If the UI says cancelled paid orders will be refunded, where is the actual Maya refund call?"
- **Observed discrepancy or flaw:** The cancellation route does not call a Maya refund or void API. It only marks the database as `refunded`.
- **Why it matters:** This is the kind of claim panelists will test immediately. If they ask whether the app truly performs provider-side refunds, the honest answer today is no.
- **Proof source:**
  - `apps/customer/app/api/orders/cancel/route.ts`
  - `packages/shared/src/maya.ts`
  - `apps/customer/app/(shop)/orders/[id]/page.tsx`
- **Recommended fix:** Add real Maya refund or void support in `packages/shared/src/maya.ts`, call it from the cancel route, and change UI copy to reflect exact rules.
- **Defense-safe answer:** "At present, cancellation updates the internal payment state and refund record, but provider-side refund execution is not yet automated. That pathway is identified as a next-phase integration."

#### Finding C2: POS Maya payment is exposed in UI but not completed end-to-end

- **Panel question:** "Why does POS allow Maya payment if the staff flow never starts a Maya checkout?"
- **Observed discrepancy or flaw:** `apps/pos/app/(pos)/new-order/page.tsx` lets staff choose `payment_method = 'maya'`, but `apps/pos/app/(pos)/payment/[id]/page.tsx` only shows a waiting screen and does not create a Maya checkout session, QR, deep link, or redirect.
- **Why it matters:** This looks like a finished feature in the interface, but operationally it is incomplete.
- **Proof source:**
  - `apps/pos/app/(pos)/new-order/page.tsx`
  - `apps/pos/app/(pos)/payment/[id]/page.tsx`
- **Recommended fix:** Either implement a real POS Maya initiation flow or remove/hide POS Maya until it is truly supported.
- **Defense-safe answer:** "Maya is fully implemented for the customer channel. POS-side Maya handling is currently staged as a pending extension, so the production-safe cashier flow remains cash."

#### Finding C3: The authoritative database source is unclear

- **Panel question:** "Which schema is the real one: `schema.sql`, `master_setup.sql`, or the run migrations?"
- **Observed discrepancy or flaw:** The repo contains multiple overlapping schema authorities. The README still instructs setup via `supabase/schema.sql`, but the project also uses `supabase/master_setup.sql` and many post-schema migrations for delivery, QR, notifications, clock entries, voucher claims, auto-cancel, and security changes.
- **Why it matters:** A panel will not trust the architecture if the repo cannot clearly answer what the actual database contract is.
- **Proof source:**
  - `README.md`
  - `supabase/schema.sql`
  - `supabase/master_setup.sql`
  - `supabase/migrations/run4_qr_guests.sql`
  - `supabase/migrations/run5_delivery.sql`
  - `supabase/migrations/run6_overhaul*.sql`
  - `supabase/migrations/run7_auto_cancel.sql`
  - `supabase/migrations/run8_relax_security.sql`
- **Recommended fix:** Choose one schema authority, document exact migration order, and remove or archive obsolete setup paths.
- **Defense-safe answer:** "The final deployed shape is migration-driven. The README has not yet been updated to reflect the newer master schema plus later run migrations."

### Major Functional Gap

#### Finding M1: Guest ordering is still not truly implemented

- **Panel question:** "Can a first-time customer place an order without creating a full account?"
- **Observed discrepancy or flaw:** The walkthrough explicitly says guest anonymous auth is not yet implemented. Checkout redirects to login when no user is present.
- **Why it matters:** If the defense narrative suggests frictionless public ordering, this gap will be obvious.
- **Proof source:**
  - `walkthrough.md`
  - `apps/customer/app/(shop)/cart/page.tsx`
  - `apps/customer/app/(shop)/checkout/page.tsx`
- **Recommended fix:** Implement `signInAnonymously()` or revise all thesis and UI copy to say authentication is required before checkout.
- **Defense-safe answer:** "Public browsing is open, but order submission currently requires authentication. Anonymous checkout is documented as a planned extension."

#### Finding M2: Notifications have a consumer path but no clear producer path

- **Panel question:** "What actually creates notifications?"
- **Observed discrepancy or flaw:** The app reads and displays notifications and marks them read, but no app-side notification inserts were found.
- **Why it matters:** This suggests a visible subsystem without a real event-production pipeline.
- **Proof source:**
  - `packages/shared/src/hooks/useNotifications.ts`
  - `apps/customer/components/NotificationPanel.tsx`
  - search across `apps` and `packages/shared` found no producer writes to `notifications`
  - `supabase/migrations/run6_overhaul.sql`
- **Recommended fix:** Add explicit notification producers for order updates, vouchers, low stock, promos, and system events.
- **Defense-safe answer:** "The notification inbox and data model are in place, but only the read-side UX is complete. Event-generation is not yet fully wired."

#### Finding M3: `voucher_claims` exists in schema but is not wired into app behavior

- **Panel question:** "How do customers claim or own vouchers if `voucher_claims` exists?"
- **Observed discrepancy or flaw:** Run6 creates `voucher_claims` with policies and indexes, but no app code reads or writes that table.
- **Why it matters:** This looks like a planned subsystem that was not fully landed.
- **Proof source:**
  - `supabase/migrations/run6_overhaul.sql`
  - `supabase/migrations/run6_overhaul_part1.sql`
  - search across `apps` and `packages/shared` found no runtime usage of `voucher_claims`
- **Recommended fix:** Either wire claim issuance and ownership tracking into the customer and admin flows or remove the table from the defended feature list.
- **Defense-safe answer:** "Voucher validation and application are implemented. Claim ownership persistence is partially scaffolded in the schema but not yet surfaced in the app."

#### Finding M4: Timekeeping is split across `shifts` and `clock_entries`

- **Panel question:** "Why do POS and Admin use different timekeeping tables?"
- **Observed discrepancy or flaw:** POS and admin protected layouts auto clock-in and clock-out through `shifts`, while admin staff management uses `clock_entries`.
- **Why it matters:** This creates model duplication and makes it unclear which table is operationally authoritative.
- **Proof source:**
  - `apps/pos/app/(pos)/layout.tsx`
  - `apps/admin/app/(admin)/layout.tsx`
  - `apps/pos/app/(pos)/dashboard/page.tsx`
  - `apps/admin/app/(admin)/staff-management/page.tsx`
  - `supabase/migrations/run1_tables_ingredients.sql`
  - `supabase/migrations/run6_overhaul.sql`
- **Recommended fix:** Consolidate on one timekeeping model and migrate the other away.
- **Defense-safe answer:** "The newer admin-facing timekeeping model is `clock_entries`. The older `shifts` path remains for POS compatibility and needs consolidation."

### Scope / Narrative Risk

#### Finding S1: The repo now describes a broader system than the thesis title suggests

- **Panel question:** "Is this still an ordering application system, or is it already a cafe management suite?"
- **Observed discrepancy or flaw:** The system now includes inventory, loyalty, timekeeping, void authorization, pickup QR, delivery integration, analytics, notifications, and voucher claims on top of ordering.
- **Why it matters:** This is not bad, but it requires intentional framing. If it is defended as only an ordering app, the panel may see the scope as uncontrolled.
- **Proof source:**
  - `README.md`
  - `apps/admin/app/(admin)/inventory/page.tsx`
  - `apps/admin/app/(admin)/loyalty/page.tsx`
  - `apps/admin/app/(admin)/staff-management/page.tsx`
  - `apps/admin/app/(admin)/analytics/page.tsx`
  - `apps/admin/app/(admin)/void-tokens/page.tsx`
  - `apps/customer/app/api/lalamove/*`
  - `docs/system-dfd.md`
- **Recommended fix:** Use "ordering-centered cafe management system" or "ordering and operations system" language consistently.
- **Defense-safe answer:** "Ordering remains the core transaction flow. Inventory, loyalty, delivery, and staff control are supporting subsystems that stabilize and operationalize the ordering lifecycle."

#### Finding S2: Some admin pages still reflect the pre-run6 order model

- **Panel question:** "Why does admin still label non-dine-in orders as takeout when the schema now supports pickup and delivery?"
- **Observed discrepancy or flaw:** The admin orders page maps `dine_in` to "Dine In" and everything else to "Takeout".
- **Why it matters:** This exposes migration drift directly in the interface.
- **Proof source:**
  - `apps/admin/app/(admin)/orders/page.tsx`
  - `packages/shared/src/types/index.ts`
  - `supabase/migrations/run5_delivery.sql`
  - `supabase/migrations/run6_overhaul.sql`
- **Recommended fix:** Normalize order type rendering across admin, POS, and customer flows.
- **Defense-safe answer:** "The underlying data model supports delivery and pickup. Some older admin labels still reflect the legacy dine-in/takeout stage and need UI normalization."

### Security / Integrity Risk

#### Finding G1: Security hardening and rollback migrations conflict

- **Panel question:** "What is the real security posture if one migration hardens and another later removes those protections?"
- **Observed discrepancy or flaw:** `security_hardening.sql` adds restrictive guards and revokes, while `run8_relax_security.sql` drops some triggers, removes stricter policies, and grants broad function permissions back.
- **Why it matters:** This makes the security story unstable and makes deployment order matter in risky ways.
- **Proof source:**
  - `supabase/migrations/security_hardening.sql`
  - `supabase/migrations/run8_relax_security.sql`
- **Recommended fix:** Collapse to one tested security baseline and archive rollback-only scripts away from the normal migration chain.
- **Defense-safe answer:** "The repo currently preserves both a hardening pass and a rollback pass because the stricter version caused operational regressions. The final deployment path should converge to one tested baseline."

#### Finding G2: Customer order cancellation can work without authenticated ownership

- **Panel question:** "Why can a guest cancel an order by UUID alone?"
- **Observed discrepancy or flaw:** The cancel route allows cancellation without auth if the caller knows the order UUID, treating it as capability-style access.
- **Why it matters:** This is a non-obvious security tradeoff that needs a very careful defense if kept.
- **Proof source:**
  - `apps/customer/app/api/orders/cancel/route.ts`
- **Recommended fix:** Require authenticated ownership or a signed cancel token, not just the raw order ID.
- **Defense-safe answer:** "The route currently allows capability-style guest cancellation to support guest-oriented flows, but a signed token model would be the safer production design."

#### Finding G3: Some sensitive admin actions are direct browser writes with limited auditability

- **Panel question:** "Where is the audit trail for manual role changes, manual point adjustments, and manual restocks?"
- **Observed discrepancy or flaw:** Several admin pages update data directly from the browser client. Inventory restock at least inserts an inventory log, but manual role changes and point adjustments do not show a comparable audit trail.
- **Why it matters:** Panelists will expect privileged operations to be explicit, controlled, and traceable.
- **Proof source:**
  - `apps/admin/app/(admin)/staff/page.tsx`
  - `apps/admin/app/(admin)/loyalty/page.tsx`
  - `apps/admin/app/(admin)/inventory/page.tsx`
- **Recommended fix:** Move sensitive updates behind server routes or RPC functions that also write audit logs.
- **Defense-safe answer:** "Admin actions are protected by role-aware access and RLS, but not all of them are yet accompanied by explicit audit logging."

### Design / UX / Operational Weakness

#### Finding D1: Delivery, pickup, cash, Maya, QR, and cancellation logic are concentrated in a few heavy pages

- **Panel question:** "How resilient is this system when one page carries multiple operational responsibilities?"
- **Observed discrepancy or flaw:** `orders/[id]/page.tsx`, the POS dashboard, and POS payment page each carry multiple business processes.
- **Why it matters:** This increases brittleness and makes debugging or explaining state transitions harder.
- **Proof source:**
  - `apps/customer/app/(shop)/orders/[id]/page.tsx`
  - `apps/pos/app/(pos)/dashboard/page.tsx`
  - `apps/pos/app/(pos)/payment/[id]/page.tsx`
- **Recommended fix:** Move key transitions into smaller service functions or server endpoints with clearer responsibilities.
- **Defense-safe answer:** "The operational logic is working, but some pages still centralize too much orchestration and would benefit from further service-layer extraction."

### Minor Cleanup

#### Finding N1: Thesis-facing documentation is behind the codebase

- **Panel question:** "Which document should we trust: README, walkthrough, DFD, or the SQL?"
- **Observed discrepancy or flaw:** README and walkthrough are useful but partly outdated relative to the newer data model and flows.
- **Why it matters:** This raises doubt even when the code itself is strong.
- **Proof source:**
  - `README.md`
  - `walkthrough.md`
- **Recommended fix:** Publish a single "current system truth" document for defense use.
- **Defense-safe answer:** "The implementation has advanced faster than the repo-level narrative. The defense version should use a refreshed system overview instead of the older setup-oriented README."

## Section 3: Subsystem-by-Subsystem Findings

### Customer App

#### What it does

- menu browsing and item detail
- cart and voucher application
- checkout and Maya payment initiation
- order tracking, QR pickup, cancellation, delivery tracking
- account, vouchers, rewards, addresses, and guest receipt display

#### What is strong

- Maya checkout creation and return verification exist
- order tracking is rich and covers pickup and delivery states
- voucher validation happens server-side
- guest receipt access uses tokenized receipt URLs

#### What panelists may challenge

- checkout still requires login despite guest-facing expectations
- cancellation promises refunds more strongly than the implementation delivers
- notification UX exists without a clearly implemented event-production layer
- rewards and vouchers look broader than the actual persistence model in use

### POS App

#### What it does

- staff login and protected access
- dashboard-style order progression
- walk-in order creation
- cash payment handling
- QR-based pickup confirmation
- QR-based manager-authorized voids
- KDS-style read view

#### What is strong

- walk-in order flow is real
- guest receipt QR generation exists
- void token flow has a server-side hash validation path
- QR pickup flow is implemented and updates order state

#### What panelists may challenge

- POS Maya path is incomplete
- `ready -> completed` is largely tied to QR pickup or delivery status, which needs explicit defense depending on order type
- timekeeping uses `shifts`, while admin timekeeping uses `clock_entries`

### Admin App

#### What it does

- dashboards and analytics
- categories and menu management
- vouchers
- inventory and recipe visibility
- staff list and role changes
- staff-management clock view
- loyalty management
- void token generation
- order monitoring

#### What is strong

- broad operational visibility
- inventory has stock alerts and recipe cost visibility
- loyalty has tier overview and adjustment UI
- manager QR authorization for voiding is a clear operational control

#### What panelists may challenge

- scope breadth relative to the thesis title
- mixed use of legacy and run6 models
- some privileged writes go directly from browser client to tables
- no obvious audit log for admin-sensitive actions like role change and points adjustment

### Shared Code and API Layer

#### What it does

- Supabase client and server client setup
- auth state and role resolution
- menu and order data hooks
- Maya service abstraction
- geofencing and notifications
- customer-side API routes for Maya, delivery, vouchers, and cancellation

#### What is strong

- shared hooks keep customer, POS, and admin reasonably consistent
- Maya logic is centralized in `packages/shared/src/maya.ts`
- Lalamove routes are separated by concern: quotation, order, dispatch, status

#### What panelists may challenge

- refund capability is absent from the Maya service
- notifications have read-side plumbing but no visible producer
- some order and status logic still lives in large UI pages instead of dedicated service layers

### Database and Migrations

#### What it does

- core auth-linked profiles and role model
- ordering, items, status history, vouchers
- inventory, recipes, shifts, loyalty
- QR subsystems
- delivery fields
- notifications, clock entries, voucher claims
- security hardening and rollback scripts

#### What is strong

- extensive use of RLS
- useful trigger-based business rules exist for status history, loyalty, QR support, and inventory
- run migrations show thoughtful expansion in stages

#### What panelists may challenge

- schema authority drift
- migration overlap and duplication
- conflicting security migrations
- coexistence of old and new models in the same repo

## Section 4: Pathway Completeness Matrix

Legend:

- `Implemented` = full end-to-end path exists in repo
- `Partial` = usable path exists, but an important stage is missing or implied
- `Implied / Missing` = schema or UI suggests the feature exists, but the full path is not wired

| Pathway | Status | Evidence | Main panel pressure point |
| --- | --- | --- | --- |
| Auth: sign up / sign in / sign out | Implemented | `packages/shared/src/hooks/useAuth.tsx`, auth pages in all apps | role and cookie isolation story must be explained cleanly |
| Role access and staff/admin separation | Implemented | app layouts, shared auth hook, scoped auth cookies | good, but documentation should explain it |
| Customer browse -> cart -> checkout -> pay -> track | Implemented | customer pages, Maya checkout route, Maya verify route | strong path |
| Customer cancel -> refund | Partial | cancel route exists, refund is internal-only | provider-side refund is missing |
| Customer guest checkout | Partial | walkthrough says not implemented, checkout redirects to login | public-ordering claim needs qualification |
| POS walk-in create -> cash payment -> queue | Implemented | POS new order and payment pages | strong cashier path |
| POS walk-in create -> Maya payment | Partial | POS UI allows Maya, payment page waits only | incomplete operational path |
| POS status progression | Implemented | POS dashboard | final completion model varies by order type and needs explanation |
| Pickup completion via QR | Implemented | POS dashboard + `pickup_tokens` + customer order page | good thesis demo material |
| Void via manager authorization | Implemented | admin void-token page + POS void page + `void_order_with_token` | strong control story |
| Guest receipt issuance | Implemented | POS payment page + guest receipt page + `guest_receipts` | good supporting subsystem |
| Admin menu/categories/vouchers | Implemented | admin pages + vouchers validate route | solid |
| Admin inventory viewing/restock/recipes | Implemented | inventory page + inventory schema/triggers | schema authority needs clarity |
| Inventory auto-deduction on completed orders | Partial | trigger exists in run3/feature expansion | depends on migration chain being applied |
| Low-stock to menu availability coupling | Partial | trigger exists in run3/feature expansion | same schema-authority issue |
| Admin loyalty viewing | Implemented | loyalty page + points/tier schema | fine |
| Loyalty earning on order completion | Implemented | `award_points_on_completion()` | strong if live DB has final function |
| Voucher validation/application | Implemented | vouchers validate route + checkout flow | good |
| Voucher claims ownership/persistence | Implied / Missing | table exists, app usage absent | feature sounds bigger than implementation |
| Notifications display/read | Implemented | notification hook + panel | good as UI |
| Notifications production | Implied / Missing | producer path not found | this is the gap |
| Lalamove quotation -> create order -> dispatch -> status | Partial | delivery routes and tracker exist | cancellation/failure resilience and weak-internet behavior need explanation |
| Lalamove cancellation/failure handling | Partial | cancel route hits Lalamove delete; status route syncs state | no robust retry or queue strategy |
| Maya checkout -> redirect -> verify -> webhook | Implemented | checkout, verify, webhook, shared Maya service | strongest payment path |
| Maya refund / void | Implied / Missing | no refund method in Maya service | critical panel challenge |
| QR guest receipt | Implemented | guest receipt page and QR creation | solid |
| Shifts / timekeeping | Partial | `shifts` and `clock_entries` both exist | duplicate model |
| Migrations aligned to runtime | Partial | multiple overlapping SQL sources | documentation and deployment risk |

## Section 5: Recommended Fix Backlog

### Must-fix before defense if possible

1. Remove or clearly relabel POS Maya until it is truly end-to-end.
2. Change refund-related UI copy unless real Maya refund support is added.
3. Publish one authoritative database setup story and migration order.
4. Decide which timekeeping model is the official one: `shifts` or `clock_entries`.
5. Prepare a concise explanation for why the scope includes inventory, loyalty, staff, QR, and delivery.

### High-value defense improvements

1. Add a real audit log for admin role changes, loyalty adjustments, and other privileged operations.
2. Add a notification producer path for at least order updates and promo broadcasts.
3. Either wire `voucher_claims` into customer/admin behavior or explicitly mark it as a staged schema feature.
4. Normalize order type labels across admin, POS, and customer flows.
5. Update README and walkthrough so the repo tells one consistent story.

### Good technical cleanup after defense

1. Extract more orchestration logic from heavyweight UI pages into services.
2. Consolidate schema duplication between `schema.sql`, `master_setup.sql`, and the run migrations.
3. Collapse security migration history into one tested baseline and separate rollback-only scripts.

## Section 6: Defense-Safe Narrative / Anticipated Panel Questions

### Is this still an ordering application system?

Yes, but the most accurate phrasing is:

> **A PWA-based cafe ordering and operations system with customer, POS, and administrative subsystems.**

### Ordering-core

- customer menu browsing
- cart and checkout
- Maya payment initiation and verification
- order tracking
- POS walk-in order creation
- POS order progression
- vouchers as order incentives

### Ordering-support

- inventory and recipe tracking
- loyalty points and tiering
- staff access and timekeeping
- QR pickup and guest receipts
- void authorization
- delivery orchestration
- analytics and notifications

### Possible scope creep

- `voucher_claims` without app wiring
- notification infrastructure without visible producers
- dual timekeeping models
- partial run6 adoption in admin pages

### Suggested defense wording

Use this framing:

> "The thesis is centered on the order lifecycle: browse, order, pay, fulfill, and complete. The POS, inventory, loyalty, QR, and delivery subsystems exist to operationalize that lifecycle in a real cafe setting rather than to form unrelated standalone products."

### Likely panel questions and safe answers

#### "Why is inventory inside an ordering system?"

Because order fulfillment depends on ingredient availability, menu availability, and stock deduction. Inventory is not presented as a separate ERP. It supports order readiness and product availability.

#### "Why are loyalty and vouchers included?"

They influence acquisition, repeat purchase behavior, and post-order retention. In the system, they are tied to orders and rewards, not a separate CRM platform.

#### "Why is staff management here?"

Because the POS and admin modules are role-sensitive. The project models who can fulfill orders, authorize voids, and perform privileged operations.

#### "Why is delivery included?"

Because delivery is an order-fulfillment channel, not a separate logistics platform. The app coordinates quote, dispatch, and status to complete the customer order lifecycle.

#### "Why does the repo look larger than a normal ordering app?"

Because the project evolved from a simple ordering thesis into an ordering-centered cafe operations system. The defense should acknowledge that growth directly instead of trying to minimize it.

## Section 7: Repo Inventory and Function Map

### 7.1 Customer user-facing modules

| Module | Classification | Purpose | Audit note |
| --- | --- | --- | --- |
| `apps/customer/app/(auth)/login/page.tsx` | user-facing auth page | customer sign in | standard |
| `apps/customer/app/(auth)/register/page.tsx` | user-facing auth page | customer sign up | standard |
| `apps/customer/app/(shop)/menu/page.tsx` | user-facing shop page | landing/home ordering view | strong customer entry point |
| `apps/customer/app/(shop)/menu/browse/page.tsx` | user-facing shop page | browse categories/items | standard |
| `apps/customer/app/(shop)/menu/browse/[id]/page.tsx` | user-facing shop page | item detail and add to cart | standard |
| `apps/customer/app/(shop)/menu/[id]/page.tsx` | user-facing shop page | legacy item detail path | potential route overlap to explain |
| `apps/customer/app/(shop)/cart/page.tsx` | user-facing shop page | cart review and order mode | checkout gated by auth |
| `apps/customer/app/(shop)/checkout/page.tsx` | user-facing payment page | order creation and Maya/cash choice | customer Maya path exists |
| `apps/customer/app/(shop)/checkout/confirm/page.tsx` | user-facing confirmation page | checkout confirmation | supporting |
| `apps/customer/app/(shop)/orders/page.tsx` | user-facing order list | list customer orders | standard |
| `apps/customer/app/(shop)/orders/[id]/page.tsx` | user-facing order detail | tracking, cancel, pickup, delivery, payment verify | heavy orchestration page |
| `apps/customer/app/(shop)/account/page.tsx` | user-facing account page | profile and account actions | supporting |
| `apps/customer/app/(shop)/profile/edit/page.tsx` | user-facing account page | profile editing | supporting |
| `apps/customer/app/(shop)/profile/addresses/page.tsx` | user-facing account page | saved addresses | delivery-supporting |
| `apps/customer/app/(shop)/rewards/page.tsx` | user-facing rewards page | rewards placeholder/UX | depends on loyalty depth |
| `apps/customer/app/(shop)/vouchers/page.tsx` | user-facing voucher page | browse vouchers | good UX, claim model partial |
| `apps/customer/app/receipt/[token]/page.tsx` | public customer utility page | guest receipt display | good supporting feature |

### 7.2 POS user-facing modules

| Module | Classification | Purpose | Audit note |
| --- | --- | --- | --- |
| `apps/pos/app/(auth)/login/page.tsx` | staff auth page | POS login | standard |
| `apps/pos/app/(pos)/dashboard/page.tsx` | POS operations page | queue board, QR pickup, status progression | heavy but strong |
| `apps/pos/app/(pos)/new-order/page.tsx` | POS cashier page | walk-in order creation | strong, Maya partial |
| `apps/pos/app/(pos)/payment/[id]/page.tsx` | POS cashier page | cash acceptance and guest receipt | Maya wait state incomplete |
| `apps/pos/app/(pos)/void/page.tsx` | POS control page | void via manager QR | strong operational control |
| `apps/pos/app/kds/page.tsx` | kitchen display page | KDS read view | supporting |

### 7.3 Admin user-facing modules

| Module | Classification | Purpose | Audit note |
| --- | --- | --- | --- |
| `apps/admin/app/(auth)/login/page.tsx` | admin auth page | admin login | standard |
| `apps/admin/app/(admin)/dashboard/page.tsx` | admin operations page | high-level operational overview | strong support module |
| `apps/admin/app/(admin)/orders/page.tsx` | admin operations page | order monitoring | legacy order-type labeling |
| `apps/admin/app/(admin)/menu/page.tsx` | admin operations page | menu management | core support |
| `apps/admin/app/(admin)/categories/page.tsx` | admin operations page | category management | core support |
| `apps/admin/app/(admin)/vouchers/page.tsx` | admin operations page | voucher management | core support |
| `apps/admin/app/(admin)/inventory/page.tsx` | admin operations page | ingredients, recipes, restock | broadens scope |
| `apps/admin/app/(admin)/loyalty/page.tsx` | admin operations page | tiers and points adjustments | broadens scope |
| `apps/admin/app/(admin)/staff/page.tsx` | admin operations page | role changes and user list | privileged operations need audit trail |
| `apps/admin/app/(admin)/staff-management/page.tsx` | admin operations page | clock entries and roster | conflicts with `shifts` model |
| `apps/admin/app/(admin)/void-tokens/page.tsx` | admin operations page | manager QR issuance | good POS control support |
| `apps/admin/app/(admin)/analytics/page.tsx` | admin operations page | analytics | ordering-support, not core ordering |

### 7.4 API route map

| Route file | Main function | Role in system | Audit note |
| --- | --- | --- | --- |
| `apps/customer/app/api/maya/checkout/route.ts` | `POST` | create customer Maya checkout | implemented |
| `apps/customer/app/api/maya/verify/route.ts` | `POST` | verify payment and update order | implemented |
| `apps/customer/app/api/maya/webhook/route.ts` | `POST` | webhook payment sync | implemented |
| `apps/customer/app/api/orders/cancel/route.ts` | `POST` | cancel order and internal refund marking | critical refund gap |
| `apps/customer/app/api/vouchers/validate/route.ts` | `POST` | validate voucher server-side | implemented |
| `apps/customer/app/api/lalamove/quotation/route.ts` | `POST` | request delivery quote | implemented |
| `apps/customer/app/api/lalamove/order/route.ts` | `POST` | create delivery order | implemented |
| `apps/customer/app/api/lalamove/dispatch/route.ts` | `POST` | dispatch order to Lalamove | implemented |
| `apps/customer/app/api/lalamove/status/route.ts` | `GET` | poll delivery status and sync DB | partial operational resilience |
| `apps/customer/app/api/lalamove/lib.ts` | helpers | Lalamove signature and request helper | central delivery utility |

### 7.5 Shared behavioral modules

| Module | Exported behavior | Classification | Audit note |
| --- | --- | --- | --- |
| `packages/shared/src/hooks/useAuth.tsx` | `AuthProvider`, `useAuth` | auth/state layer | central and important |
| `packages/shared/src/hooks/useMenu.ts` | `useMenu` | menu query layer | stable |
| `packages/shared/src/hooks/useOrders.ts` | `useOrders`, `useOrder` | order query layer | central across all apps |
| `packages/shared/src/hooks/useNotifications.ts` | `useNotifications` | notification read layer | producer gap |
| `packages/shared/src/hooks/useGeofence.ts` | `CAFE_LOCATION`, `haversineKm`, `useGeofence` | delivery/ordering restriction | strong supporting feature |
| `packages/shared/src/supabase/client.ts` | `supabase` | browser Supabase client | scoped auth cookies matter |
| `packages/shared/src/supabase/server.ts` | `createAdminSupabaseClient`, `createAppServerClient` | server Supabase access | critical API layer |
| `packages/shared/src/maya.ts` | `MayaService` | payment service layer | no refund/void method |

### 7.6 Database-side behavioral objects

| Object | Where found | Purpose | Audit note |
| --- | --- | --- | --- |
| `handle_new_user()` | `schema.sql`, `master_setup.sql` | create profile on auth user creation | core auth bootstrap |
| `get_my_role()` | `master_setup.sql`, fix/hardening files | RLS helper | source of recursion/hardening tension |
| `generate_order_number()` | `schema.sql`, `master_setup.sql` | human-readable order numbering | core |
| `log_order_status_change()` | `schema.sql`, `master_setup.sql` | audit status transitions | core |
| `update_updated_at()` | `schema.sql`, `master_setup.sql` | timestamps | standard utility |
| `award_points_on_completion()` | `points.sql`, `run3`, `feature_expansion*`, `master_setup.sql` | loyalty accrual | important and duplicated |
| `guard_profile_mutation()` | hardening and master schema paths | protect sensitive profile fields | regression-prone |
| `guard_order_mutation()` | hardening and master schema paths | protect sensitive order fields | regression-prone |
| `deduct_inventory_on_order_complete()` | `run3`, `feature_expansion*` | stock deduction | depends on migration path |
| `check_stock_and_mark_unavailable()` | `run3`, `feature_expansion*` | auto availability | depends on migration path |
| `update_loyalty_tier()` | `run3`, `feature_expansion*` | derive loyalty tier | supporting |
| `generate_pickup_token()` | `run4_qr_guests.sql` | create customer pickup token | strong support |
| `cleanup_expired_receipts()` | `run4_qr_guests.sql` | clear expired guest receipts | support utility |
| `void_order_with_token()` | `run4_qr_guests.sql` | manager-authorized void | strong POS control |

### 7.7 Migration map by purpose

| Migration | Main purpose | Audit classification |
| --- | --- | --- |
| `supabase/schema.sql` | original thesis schema + seed assumptions | legacy baseline, no longer sufficient alone |
| `supabase/master_setup.sql` | consolidated schema/hardening baseline | strong candidate for authority, but incomplete versus later runs |
| `supabase/migrations/run1_tables_ingredients.sql` | ingredients, recipes, variant ingredients, logs, shifts, loyalty tiers | operational-support expansion |
| `supabase/migrations/run2_recipes_variants.sql` | seeded recipe mappings and variant ingredient logic | inventory-support expansion |
| `supabase/migrations/run3_triggers.sql` | inventory deduction, stock availability, points, loyalty tier, profile guard | business-rule automation |
| `supabase/migrations/run4_qr_guests.sql` | void tokens, pickup tokens, guest receipts | QR and guest-support expansion |
| `supabase/migrations/run5_delivery.sql` | delivery fields, saved addresses, Lalamove support | fulfillment expansion |
| `supabase/migrations/run6_overhaul*.sql` | pickup normalization, notifications, clock entries, voucher claims, add-ons, recipient fields | broad scope expansion |
| `supabase/migrations/run7_auto_cancel.sql` | auto-cancel expired orders, Maya checkout URL, cron scheduling | operational automation |
| `supabase/migrations/security_hardening.sql` | stricter DB security controls | security tightening, caused regressions |
| `supabase/migrations/run8_relax_security.sql` | rollback of problematic hardening | stability patch, but security-story risk |

### 7.8 Data-store inventory

This table groups the impactful tables that shape runtime behavior. Some exist in `schema.sql`, some in `master_setup.sql`, and some only in later migrations.

| Table | Domain | Main role | Audit note |
| --- | --- | --- | --- |
| `profiles` | identity | auth-linked user profile and role | core table, heavily policy-sensitive |
| `categories` | catalog | browse grouping | core |
| `menu_items` | catalog | products | core |
| `item_variants` | catalog | size, sugar, flavor, add-ons | core and expanded in run6 |
| `orders` | ordering | main transaction record | central table with most drift pressure |
| `order_items` | ordering | itemized order lines | core |
| `order_status_history` | ordering | status audit trail | core |
| `vouchers` | promotions | discount catalog | core support |
| `ingredients` | inventory | stock units | support subsystem |
| `menu_item_ingredients` | inventory | recipe mapping | support subsystem |
| `variant_ingredients` | inventory | variant-specific deduction | support subsystem |
| `inventory_logs` | inventory | stock movement audit | support subsystem |
| `shifts` | staffing | older clock-in/out model | overlaps with `clock_entries` |
| `loyalty_tiers` | loyalty | reward tiers | support subsystem |
| `void_tokens` | QR / control | manager authorization for voids | strong operational support |
| `pickup_tokens` | QR / pickup | pickup confirmation tokens | strong operational support |
| `guest_receipts` | guest support | temporary public receipt access | strong supporting feature |
| `saved_addresses` | delivery | customer delivery addresses | support subsystem |
| `notifications` | communications | inbox/read model | producer path incomplete |
| `clock_entries` | staffing | newer timekeeping model | overlaps with `shifts` |
| `voucher_claims` | rewards / ownership | claimed voucher persistence | schema present, app usage absent |

### 7.9 Policy inventory by functional domain

Because the same policy ideas are duplicated across `schema.sql`, `master_setup.sql`, and later migrations, the audit classifies policies by **functional object family** instead of repeating every duplicate definition line-by-line.

| Object family | Policy intent | Where defined | Audit note |
| --- | --- | --- | --- |
| `profiles` | self-read, self-update, staff/admin read-all, admin update-all, service-role insert | `schema.sql`, `master_setup.sql`, hardening files | highest recursion and hardening risk |
| `categories` | public read, admin write | `schema.sql`, `master_setup.sql` | stable |
| `menu_items` | public read, admin write | `schema.sql`, `master_setup.sql` | stable |
| `item_variants` | public read, admin write | `schema.sql`, `master_setup.sql` | stable |
| `orders` | customer own read/insert, staff/admin read/update, service-role effects via server | `schema.sql`, `master_setup.sql`, relax/hardening files | central to thesis and security story |
| `order_items` | customer own read/insert, staff/admin read/insert | `schema.sql`, `master_setup.sql` | stable |
| `order_status_history` | customer own read, staff/admin read/insert | `schema.sql`, `master_setup.sql` | stable |
| `vouchers` | public read active, admin write | `schema.sql`, `master_setup.sql` | stable |
| `ingredients` | public read, admin manage | `run1`, `feature_expansion*` | depends on later migration path |
| `menu_item_ingredients` | public read, admin manage | `run1`, `feature_expansion*` | depends on later migration path |
| `variant_ingredients` | public read, admin manage | `run1`, `feature_expansion_safe.sql` | support-only schema |
| `inventory_logs` | staff/admin read and insert | `run1`, `feature_expansion*` | useful audit trail |
| `shifts` | staff own manage, admin/staff read depending on file version | `run1`, `feature_expansion*` | legacy timekeeping model |
| `loyalty_tiers` | public read, admin manage | `run1`, `feature_expansion*` | support-only schema |
| `void_tokens` | admin manage, staff read/use | `run4_qr_guests.sql` | good control boundary |
| `pickup_tokens` | customer own read/insert, staff/admin manage | `run4_qr_guests.sql` | strong pickup model |
| `guest_receipts` | public read by token, staff/admin write | `run4_qr_guests.sql` | capability-style public read must be explained |
| `saved_addresses` | customer owns addresses | `run5_delivery.sql` | delivery-support policy |
| `notifications` | user own read/update, system insert | `run6_overhaul*.sql` | good model, missing producer wiring |
| `clock_entries` | staff own manage, admin all-access | `run6_overhaul*.sql` | newer timekeeping model |
| `voucher_claims` | user own read, admin manage, system insert | `run6_overhaul*.sql` | schema exists, flow not wired |

## Section 8: Bottom-Line Panel Advice

If this system is defended honestly, its breadth can be a strength. The safest narrative is:

1. The project is an **ordering-centered cafe operations system**, not just a menu app.
2. The customer ordering lifecycle is the core.
3. POS, admin, inventory, loyalty, delivery, and QR modules support that lifecycle.
4. Some advanced subsystems are implemented fully, while a few are staged or partial.
5. The defense should acknowledge partial paths directly instead of overselling them.

If that framing is used, the strongest live risks to fix or soften before defense are:

- refund wording versus real refund implementation
- POS Maya incompleteness
- schema authority drift
- timekeeping model duplication
- missing notification producer path
