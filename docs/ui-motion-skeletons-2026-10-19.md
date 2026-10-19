# Skeleton loading, motion and Admin notifications · 19 October 2026

## Brief

Improve UI/UX across Customer (4000), Staff POS (4001) and Admin (4002): skeleton loading everywhere, one system-wide motion language down to small details, expressive but never in the way, a friendlier Admin, and a full Admin notification center. Existing brand, tokens, routes, safeguards and the approved dashboard stay as they are.

## Shared foundation (`packages/shared/src/ui`)

| File | Role |
| --- | --- |
| `motion.css` | `--jm-*` durations, easings, distances; keyframes; `.jm-reveal`, `.jm-stagger`, `.jm-pop`, `.jm-shake`; route progress bar. Under reduced motion, spatial animation becomes opacity only. |
| `skeleton.css` | `.jsk` shapes with one compositor-only sweep. Each app maps `--jsk-base` and `--jsk-highlight` to its theme. Skeletons fade in after 120 ms so fast loads never flash. Reduced motion uses a static, gently breathing tone. |
| `skeleton.tsx` | `Skeleton`, `SkeletonText`, `SkeletonStatus` (one polite status region per placeholder, named by `aria-label`; `label={null}` for nested placeholders). |
| `route-progress.tsx` | Top progress bar for in-app link clicks, back/forward and `announceNavigation()`; `cancelNavigation()` for links whose click is blocked. Hidden from assistive technology because Next.js announces routes. |

## Per app

- **Customer**: `components/Skeletons.tsx` reuses real container classes (`product-card`, `order-card`, `detail-layout`, `account-grid`) so content replaces placeholders without layout shift. Every screen has a matching `loading.tsx`; the real bottom navigation stays mounted during route loads. Motion never transforms page-level containers because fixed bag and add bars live inside them; only leaf elements move.
- **POS**: `components/PosSkeletons.tsx` fills the catalog grid's own cells, keeps kanban columns and shows a static copy of the rail while screens or the staff session load. Ticket lines slide in with a warm flash, quantity and total roll when they change, tiles sink under the finger, and new ready numbers on the TV board arrive with a glow.
- **Admin**: `components/AdminSkeletons.tsx` provides table, metric, page, detail, form, chart, card and full-shell placeholders. `LoadingRows` keeps its API and accessible names (tests rely on them) but now renders the table skeleton. All spinners were replaced. Orders keep previous rows visible, dimmed, while refetching and debounce the order-number search. All new CSS reads only `--ui-*` and `--jm-*` tokens and passes the repository's hardcode, emoji and native-select gates.

## Admin notification center

Bell panel (`Shift+N`), sidebar badge, tab-title count and a full `/notifications` page with filters, search and per-device preferences.

Sources are read-only queries Admin already has access to: stock-blocked orders, payment reviews, open help requests, staff awaiting approval, POS cancellations (48 h) and new orders (12 h). Stock and expiry alerts come from the operations data that stock-aware pages already load, remembered for the session, because other pages must not read the stock workspace (`tests/admin-ux-browser-journeys.ts`). Read state, muted categories and pop-up preference are stored per admin on the device; nothing new is written to the database. Ongoing conditions stay listed until resolved on their page.

## Friendlier Admin

Recent pages first in `Ctrl+K`, `?` opens page help, `/` focuses the page search, back-to-top on long pages, clearer empty states with a next action, a shaped sign-in placeholder that exposes no navigation until access is verified.

## Second round (same day)

- **Colour semantics in Admin.** One vocabulary everywhere: red means a problem that blocks service, amber needs a decision today, green is done or healthy, blue is in progress or information, gray is inactive. Every semantic badge carries an icon. Orders, Menu, Stock and Notifications show a colour key; every Help drawer explains the rule. Source labels (Counter/App) are neutral so amber and blue keep their meaning, and menu availability no longer shows available items in amber.
- **Toasts.** Admin toasts slide down at the top right, use the semantic tones, can carry one follow-up link, pause on hover and show a countdown. Previously silent actions (vouchers, staff access, roles, points, category changes, cancellation PIN) now confirm. Customer toasts keep the tested five-second, top-centre behaviour and gain tones, an optional action ("View bag") and a countdown; everyday actions (add to bag, favourites, vouchers, addresses, reorder, sign-in, delivery pin) confirm with them.
- **Notification centre.** The bell panel's filters can no longer be squeezed or clipped, and long runs of the same stock condition collapse into one summary row with a link to the full list. Customers get an inbox of their own order updates and new offers, with a badge on the home bell.
- **Checkout.** Saved addresses are tappable cards instead of a native select; the pinned destination shows a map with the café and the distance; recipient fields explain how the phone number is used and validate on blur; the delivery fee shows how long the courier price is held; payment is two cards, with Maya's wordmark (white, on Maya's dark ground, at the owner's request). The review page shows the map, recipient and a Maya payment row.
- **Weak connections.** Phones mostly run on mobile data. A shared banner reports offline, slow and restored states using browser signals, Data Saver and request timing from `browserFetch`. Reads that fail in transport are retried once; writes are never retried. The map preview waits for a tap on Data Saver or a weak signal. Each app has an `error.tsx` that names the likely cause and offers a retry without losing the bag or ticket draft.

## Limits

Automated checks run: typecheck, ESLint and the Admin static design gates. Browser journeys and visual review were not run in this pass; the owner is reviewing on the hosted deployment. Gates do not measure taste.
