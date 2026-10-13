# Source route inventory

Routes found in the source at the audited revision. Existence does not mean every path/input passed; consult the coverage matrix and evidence JSON.

| App | Kind | Route | Methods | Source |
| --- | --- | --- | --- | --- |
| customer | page | /check-email |  | apps/customer/app/(auth)/check-email/page.tsx |
| customer | page | /forgot-password |  | apps/customer/app/(auth)/forgot-password/page.tsx |
| customer | page | /login |  | apps/customer/app/(auth)/login/page.tsx |
| customer | page | /register |  | apps/customer/app/(auth)/register/page.tsx |
| customer | page | /reset-password |  | apps/customer/app/(auth)/reset-password/page.tsx |
| customer | page | /account |  | apps/customer/app/(shop)/account/page.tsx |
| customer | page | /cart |  | apps/customer/app/(shop)/cart/page.tsx |
| customer | page | /checkout/confirm |  | apps/customer/app/(shop)/checkout/confirm/page.tsx |
| customer | page | /checkout |  | apps/customer/app/(shop)/checkout/page.tsx |
| customer | page | /favorites |  | apps/customer/app/(shop)/favorites/page.tsx |
| customer | page | /help |  | apps/customer/app/(shop)/help/page.tsx |
| customer | page | /menu/browse |  | apps/customer/app/(shop)/menu/browse/page.tsx |
| customer | page | /menu/browse/[id] |  | apps/customer/app/(shop)/menu/browse/[id]/page.tsx |
| customer | page | /menu |  | apps/customer/app/(shop)/menu/page.tsx |
| customer | page | /menu/[id] |  | apps/customer/app/(shop)/menu/[id]/page.tsx |
| customer | page | /notifications |  | apps/customer/app/(shop)/notifications/page.tsx |
| customer | page | /orders |  | apps/customer/app/(shop)/orders/page.tsx |
| customer | page | /orders/[id] |  | apps/customer/app/(shop)/orders/[id]/page.tsx |
| customer | page | /privacy |  | apps/customer/app/(shop)/privacy/page.tsx |
| customer | page | /profile/addresses |  | apps/customer/app/(shop)/profile/addresses/page.tsx |
| customer | page | /profile/edit |  | apps/customer/app/(shop)/profile/edit/page.tsx |
| customer | page | /rewards |  | apps/customer/app/(shop)/rewards/page.tsx |
| customer | page | /terms |  | apps/customer/app/(shop)/terms/page.tsx |
| customer | page | /vouchers |  | apps/customer/app/(shop)/vouchers/page.tsx |
| customer | api | /api/branch | GET | apps/customer/app/api/branch/route.ts |
| customer | api | /api/customer/favorites | GET | apps/customer/app/api/customer/favorites/route.ts |
| customer | api | /api/customer/legal | GET, POST | apps/customer/app/api/customer/legal/route.ts |
| customer | api | /api/customer/push | GET, POST, DELETE | apps/customer/app/api/customer/push/route.ts |
| customer | api | /api/customer/recommendations | GET | apps/customer/app/api/customer/recommendations/route.ts |
| customer | api | /api/customer/support | GET, POST | apps/customer/app/api/customer/support/route.ts |
| customer | api | /api/jobs/customer-notifications | POST | apps/customer/app/api/jobs/customer-notifications/route.ts |
| customer | api | /api/lalamove/dispatch | OPTIONS, POST | apps/customer/app/api/lalamove/dispatch/route.ts |
| customer | api | /api/lalamove/order | POST | apps/customer/app/api/lalamove/order/route.ts |
| customer | api | /api/lalamove/quotation | POST | apps/customer/app/api/lalamove/quotation/route.ts |
| customer | api | /api/lalamove/status | GET | apps/customer/app/api/lalamove/status/route.ts |
| customer | api | /api/location | GET | apps/customer/app/api/location/route.ts |
| customer | api | /api/maya/checkout | POST | apps/customer/app/api/maya/checkout/route.ts |
| customer | api | /api/maya/verify | POST | apps/customer/app/api/maya/verify/route.ts |
| customer | api | /api/maya/webhook | POST | apps/customer/app/api/maya/webhook/route.ts |
| customer | api | /api/orders/cancel | POST | apps/customer/app/api/orders/cancel/route.ts |
| customer | api | /api/orders/create | POST | apps/customer/app/api/orders/create/route.ts |
| customer | api | /api/orders/guest | POST | apps/customer/app/api/orders/guest/route.ts |
| customer | api | /api/orders/[id] | GET | apps/customer/app/api/orders/[id]/route.ts |
| customer | api | /api/pickup/slots | GET | apps/customer/app/api/pickup/slots/route.ts |
| customer | api | /api/vouchers/validate | POST | apps/customer/app/api/vouchers/validate/route.ts |
| customer | page | / |  | apps/customer/app/page.tsx |
| customer | page | /receipt/[token] |  | apps/customer/app/receipt/[token]/page.tsx |
| pos | page | /check-email |  | apps/pos/app/(auth)/check-email/page.tsx |
| pos | page | /forgot-password |  | apps/pos/app/(auth)/forgot-password/page.tsx |
| pos | page | /login |  | apps/pos/app/(auth)/login/page.tsx |
| pos | page | /pending-approval |  | apps/pos/app/(auth)/pending-approval/page.tsx |
| pos | page | /register |  | apps/pos/app/(auth)/register/page.tsx |
| pos | page | /dashboard |  | apps/pos/app/(pos)/dashboard/page.tsx |
| pos | page | /new-order |  | apps/pos/app/(pos)/new-order/page.tsx |
| pos | page | /payment/[id] |  | apps/pos/app/(pos)/payment/[id]/page.tsx |
| pos | page | /void |  | apps/pos/app/(pos)/void/page.tsx |
| pos | api | /api/account/lookup | POST | apps/pos/app/api/account/lookup/route.ts |
| pos | api | /api/orders/action | POST | apps/pos/app/api/orders/action/route.ts |
| pos | api | /api/orders/checkout | POST | apps/pos/app/api/orders/checkout/route.ts |
| pos | api | /api/orders/create | POST | apps/pos/app/api/orders/create/route.ts |
| pos | api | /api/orders/delivery | POST | apps/pos/app/api/orders/delivery/route.ts |
| pos | api | /api/orders/pickup | POST | apps/pos/app/api/orders/pickup/route.ts |
| pos | api | /api/orders/queue | POST | apps/pos/app/api/orders/queue/route.ts |
| pos | page | /kds |  | apps/pos/app/kds/page.tsx |
| pos | page | / |  | apps/pos/app/page.tsx |
| admin | page | /analytics |  | apps/admin/app/(admin)/analytics/page.tsx |
| admin | page | /audit |  | apps/admin/app/(admin)/audit/page.tsx |
| admin | page | /categories |  | apps/admin/app/(admin)/categories/page.tsx |
| admin | page | /customer-care |  | apps/admin/app/(admin)/customer-care/page.tsx |
| admin | page | /dashboard |  | apps/admin/app/(admin)/dashboard/page.tsx |
| admin | page | /inventory |  | apps/admin/app/(admin)/inventory/page.tsx |
| admin | page | /loyalty |  | apps/admin/app/(admin)/loyalty/page.tsx |
| admin | page | /menu |  | apps/admin/app/(admin)/menu/page.tsx |
| admin | page | /orders |  | apps/admin/app/(admin)/orders/page.tsx |
| admin | page | /purchasing |  | apps/admin/app/(admin)/purchasing/page.tsx |
| admin | page | /scheduling |  | apps/admin/app/(admin)/scheduling/page.tsx |
| admin | page | /staff |  | apps/admin/app/(admin)/staff/page.tsx |
| admin | page | /staff-accounts |  | apps/admin/app/(admin)/staff-accounts/page.tsx |
| admin | page | /void-security |  | apps/admin/app/(admin)/void-security/page.tsx |
| admin | page | /vouchers |  | apps/admin/app/(admin)/vouchers/page.tsx |
| admin | page | /login |  | apps/admin/app/(auth)/login/page.tsx |
| admin | api | /api/customer-care/reconcile | POST | apps/admin/app/api/customer-care/reconcile/route.ts |
| admin | page | / |  | apps/admin/app/page.tsx |
