# Jayds Café cashier POS

The existing Next.js POS runs on **4001**. `/dashboard` remains the landing route, `/new-order` is Register, `/payment/[id]` continues to accept order links, `/void` provides manager overrides, and `/kds` is the public customer status board.

## Cashier workflows

- **F2** opens Register; **F3** opens Orders. Shortcuts pause while typing or using dialogs.
- Tap a product once to add its valid default configuration. Use **Options** for temperature, size, sugar, milk, add-ons, and item notes. Category and product pages have visible Previous/Next controls.
- Identical configurations and notes merge. Tap an existing line to edit; quantities have dedicated controls. Remove supports Undo; Clear requires confirmation.
- Tickets save per cashier in the browser on that device, including customer selection, points, and order notes. This storage is local to the terminal. Offline editing works; sale confirmation requires an online server response.
- Pay opens cash checkout inside Register. Use the keypad, Exact, or a denomination shortcut. Confirmed success displays the accepted order number, actual change, and canonical receipt. **Next sale** starts another ticket.
- An interrupted payment or park confirmation retains its original key and payload. Retry confirmation recovers the same accepted order and receipt, including after refresh. Pending confirmations lock ticket edits until resolved. A definitive stock, pricing, or rewards conflict retains the ticket for review.
- Park saves an unpaid draft without reserving stock or spending points. Reopen it from the separate Parked tab. Prices are reviewed again before payment. Saving edits preserves the previous ticket as a cancelled audit record and creates its replacement atomically; accepting it similarly retains the original history.
- Orders advance through New, Accepted, Preparing, and Ready. Starting preparation consumes reserved ingredients once. Counter orders can be collected directly, including loyalty-linked counter sales. Account-linked app orders use the checked pickup QR operation.
- **Mobile ASAP cash pickup** remains **Pay at pickup** through acceptance, preparation and ready status. Scan its ready customer QR; receive cash and use **Receive cash & confirm pickup** to record tender, use the token and complete collection in one transaction. A failed handover rolls all three back. Register cash payment cannot prepay an app cash pickup. Guest and account pickups follow the same handover rule. Preparation consumes stock once; loyalty credits only after successful paid completion.
- Maya orders retain provider verification. Cashier controls cannot mark a Maya payment verified or switch it to cash.
- Voiding requires the existing manager PIN, preserves audit/reward behavior, and does not automatically restore ingredients already prepared. Paid voids still use the existing refund workflow.

## Database and API

`20261007000600_cash_at_pickup.sql` is installed on the connected database. It adds `pos_cash_pickup`, keeps the checked delivery/guest QR guards, and preserves existing financial records. `POST /api/orders/checkout` also accepts a ready mobile cash pickup's `order_id` and matching `pickup_qr`, plus `expected_total` and `cash_received`. It requires approved staff and an idempotency key and invokes the atomic handover operation. Existing Maya and Register flows keep their payment rules.

The three inventory migrations, `20261002000400_pos_cashier.sql`, and `20261002000500_inventory_admin_approval.sql` are deployed to the café project. See [database rollout](pos-database-rollout.md) for target verification and preservation checks. Future deployments must install the database functions before the corresponding mutation routes. Missing functions produce an explicit upgrade message and prevent a sale.

`POST /api/orders/checkout` requires an approved staff Bearer session and `Idempotency-Key`. Send either current draft items (base product prices, normalized options, quantities, and notes), optionally `parked_order_id`, or an existing unpaid `order_id`, plus `expected_total` and `cash_received`. The server prices current catalog records; the database locks stock and commits order/items/rewards/reservations/cash tender/receipt together. The result includes canonical order identity, total, payment, change, and receipt. Previous successful keys return their original result before current catalog repricing.

`POST /api/orders/action` checks transitions and expected status. `POST /api/orders/pickup` verifies existing `pickup:`/`cached:` formats and atomically completes a ready paid order with its pickup token. Staff approval comes from database profiles, including when token metadata claims a different role.

The TV uses only `get_pos_status_board()` and the public `pos_order_state` version signal. It exposes order numbers and Preparing/Ready statuses, with reconnect refetch and a 30-second polling fallback. Overflow rotates every eight seconds; voice announcements are opt-in. Receipt links use the exact-token `get_guest_receipt` projection. Historical payments without tender records display no fabricated cash or change.

## Verification

Database fixtures cover cash retry/receipt reuse, failed-operation rollback, pricing, insufficient stock/tender, currency precision, parked edits, expiry, staff approval, atomic pickup, and public/private access. Native PostgreSQL tests also overlap real cash transactions for stock contention and duplicate submissions.

The combined suite passes **52 tests** with serial test execution, preserving the previous 37. Typecheck, lint on changed files, all three production builds, and production HTTP checks pass. Broader repository lint retains the unrelated issues documented in the inventory guide. Hosted checks verify existing cashier/Admin access, the public catalog and TV projection, Realtime connection recovery, and preservation of all 1,433 original records. The scheduled minute jobs have run successfully; the daily forecast schedule has not yet reached its first run. Live café sales, physical stock reconciliation, and real-device camera/provider checks were not performed. Stock enforcement remains disabled until counts and recipes are reconciled.

`npm run check:browser` tests all three apps against isolated PostgreSQL and intercepted API/Realtime fixtures. The cashier fixtures contain 55 products and 12 categories and exercise desktop/tablet/phone layouts, long tickets/options, draft recovery, loyalty, payment interruption/retry, parked edits, order progression, TV privacy, pickup, and PIN voiding. These tests do not create hosted café orders.

Design references: [POS Awesome product-card and shortcut patterns](https://github.com/ucraft-com/POS-Awesome), [POSR cashier workspace](https://github.com/ahmedali5530/restaurant-pos). Implementation stays within Jayds’ existing application and local branding assets.
