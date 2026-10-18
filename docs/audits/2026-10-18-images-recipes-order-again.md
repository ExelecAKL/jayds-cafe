# Image speed, Order Again and all-menu recipe audit — 18 October 2026

Customer application source: `51697c4864a24d0ed6700cd310e9da56b9858bbb`. POS application source: `3a3c02896a7edd2b23a29cbaa256146414438613`. Full backend suite: **167/167 PASS** on `7adb8f8`; the final stock-retry refinement has **19/19 focused checks PASS**, full type checks and zero lint errors (one existing cleanup-ref warning).

## Image delivery

All **55** existing generated product images were converted without replacing their artwork. Original PNGs remain at their old URLs. Content-addressed WebP files were uploaded and downloaded again to verify their SHA-256 hashes before menu links changed. Only image links changed; no prices, stocks or historical orders were edited by this step. Operator-uploaded photos are not silently replaced.

| Entire 55-product set | Bytes | Reduction |
| --- | ---: | ---: |
| Previous PNGs | 33,563,252 | — |
| 320 px cards | 1,084,346 | 96.77% |
| 640 px details | 3,373,490 | 89.95% |

Customer/POS use responsive image candidates; detail artwork gets priority and offscreen cards stay lazy-loaded. Public generated images use a bounded service-worker cache without re-downloading an unchanged image on each visit. Private uploads and account data remain outside that cache. Byte reduction is measured; it is not a claim that every network loads 97% faster.

## Order Again and availability

Home now requests only its authenticated customer's purchase history and ranks it against the already loaded catalog. This removes a second full published-catalog/availability query from initial display. Recent history stays in memory for 30 seconds and remains scoped to the signed-in owner; it is not written to local storage or service-worker caches. Returning Home can display it without waiting for a request. Focus/order events refresh history; deliberate reordering still checks today's catalog, configuration, price and bag changes. Account-switch, late-response, guest and offline boundaries pass.

Order Again uses a compact horizontal rail. Product details show a single useful availability panel instead of two raw reason banners. A failed lookup has its own Retry action and a request deadline, rather than being presented as a stock shortage.

## Recipe corrections

All **55 products** were reviewed; **204 base ingredient lines** were verified against the live database after migration `20261018000100_recipe_realism.sql`. This is a plausible operating standard, **not a barista taste test or a measurement of the café's actual portions**. Syrup brand strength, ice displacement, cooked yield and supplier serving sizes still need practical confirmation.

- Vanilla Milkshake previously contained only vanilla syrup. It now has **150 ml whole milk, 180 g vanilla ice cream and 15 ml vanilla syrup** at 16 oz.
- Restore missing milk, ice, cream and coffee components in frappes; match all scaling keys to the actual offered cup labels.
- Remove duplicate base cups/lids; size options provide exactly one correct cup/lid and a straw for cold drinks. Hot drinks consume no ice. Whipped cream replaces the flat lid with one dome lid.
- Correct French Vanilla's duplicated syrup, White Mocha's unrelated dark chocolate, Caramel Macchiato's missing vanilla, Cloud Hazelnut's foam and other mismatched flavor portions.
- Coffee recipes use an 18 g standard dry espresso dose, scaling to 27 g at 22 oz. The existing extra-shot option still adds 18 g, as previously agreed. Noncoffee matcha/milk/tea drinks contain no espresso beans.
- Whole Milk remains included. Existing Oat/Almond substitutions replace, rather than duplicate, whole milk and follow the selected size.
- Milk teas have tea, milk and ice; preparation instructions account for brewing water separately. Less Sweet reduces separately dosed sweeteners; inherent sugar in powders, fruit or ice cream cannot be removed.
- Croffles consume the ready-to-cook dough plus their actual toppings. Fries no longer consume unrelated flour, butter and eggs; they consume frozen fries, an oil allocation and the selected seasoning. Nachos require tortilla chips/cheese sauce; Chicken Pop requires chicken poppers/oil.
- Four newly required stock items start at **zero**: Vanilla Ice Cream, Tortilla Chips, Nacho Cheese Sauce and Chicken Poppers (frozen). No physical stock or purchase cost was fabricated. Milkshake/Nachos/Chicken Pop remain unavailable until supplied and counted.

The first live attempt encountered a concurrent catalog-version update and rolled back. The retry briefly locked catalog-version writes before starting the consistent snapshot and committed successfully. Within that transaction, nine protected tables were hashed before and after: orders, order items, accepted ingredient requirements, reservations, batches, movements, financial snapshots/events and invoices. All matched. Previous accepted purchases, consumption and financial history were not reconstructed with the new recipes.

### Every reviewed product

Portions below are the 16 oz drink or regular food base, before size changes/options. All quantities use stock base units.

| Product | Base ingredients |
| --- | --- |
| Americano | Espresso Beans 18 g; Ice 150 g |
| Coffee Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g |
| Spanish Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Condensed Milk 30 ml |
| Vanilla Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Vanilla Syrup 25 ml |
| French Vanilla | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; French Vanilla Syrup 25 ml |
| Caramel Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Caramel Syrup 25 ml |
| Hazelnut Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Hazelnut Syrup 25 ml |
| Macadamia Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Macadamia Syrup 25 ml |
| Butterscotch Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Butterscotch Syrup 25 ml |
| Aussie Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g |
| White Mocha Latte | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; White Mocha Sauce 25 ml |
| Cinnamon Cappuccino | Espresso Beans 18 g; Whole Milk 160 ml; Ice 150 g; Cinnamon Powder 0.5 g |
| Caramel Macchiato | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Vanilla Syrup 15 ml; Caramel Syrup 15 ml |
| Caramel Mocha | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Chocolate Powder 20 g; Caramel Syrup 20 ml |
| Salted Caramel | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Salted Caramel Sauce 30 ml |
| Mocha | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Chocolate Powder 25 g |
| Cloud Hazelnut | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Hazelnut Syrup 25 ml; Sea Salt Foam Base 20 g |
| Tres Leche Shaken Espresso | Espresso Beans 18 g; Whole Milk 160 ml; Ice 150 g; Condensed Milk 30 ml; Evaporated Milk 30 ml |
| Milo Shaken Espresso | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Milo Powder 25 g |
| Hazelnut Mocha | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Chocolate Powder 20 g; Hazelnut Syrup 20 ml |
| Biscoff | Espresso Beans 18 g; Whole Milk 200 ml; Ice 150 g; Biscoff Spread 25 g |
| Cocoa Lava | Whole Milk 200 ml; Ice 150 g; Chocolate Powder 30 g |
| Matcha Latte | Whole Milk 200 ml; Ice 150 g; Matcha Powder 4 g |
| Strawberry Milk | Whole Milk 200 ml; Ice 150 g; Strawberry Puree 45 ml |
| Nom Yen Pink Milk | Whole Milk 200 ml; Ice 150 g; Nom Yen Mix 15 g |
| Vanilla Milkshake | Whole Milk 150 ml; Vanilla Ice Cream 180 g; Vanilla Syrup 15 ml |
| Cookies & Cream | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Cookies Crumble 25 g |
| Dark Chocolate | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Chocolate Powder 25 g |
| Matcha | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Matcha Powder 4 g |
| Strawberries & Cream | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Strawberry Puree 45 ml |
| Caramel Frappe | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Espresso Beans 18 g; Caramel Syrup 30 ml |
| Mocha Frappe | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Espresso Beans 18 g; Chocolate Powder 25 g |
| Java Chip | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Espresso Beans 18 g; Chocolate Chips 20 g; Chocolate Powder 10 g |
| Salted Caramel Frappe | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Espresso Beans 18 g; Salted Caramel Sauce 30 ml |
| Biscoff Frappe | Whole Milk 150 ml; Ice 200 g; Evaporated Milk 30 ml; Espresso Beans 18 g; Biscoff Spread 30 g; Cookies Crumble 10 g |
| Classic Milk Tea | Black Tea Bags 1 pcs; Whole Milk 120 ml; Ice 150 g; Simple Syrup 20 ml |
| Wintermelon Milk Tea | Black Tea Bags 1 pcs; Whole Milk 120 ml; Ice 150 g; Wintermelon Powder 20 g |
| Okinawa Milk Tea | Black Tea Bags 1 pcs; Whole Milk 120 ml; Ice 150 g; Brown Sugar Syrup 30 ml |
| Dark Chocolate Milk Tea | Black Tea Bags 1 pcs; Whole Milk 120 ml; Ice 150 g; Chocolate Powder 20 g |
| Taro Milk Tea | Black Tea Bags 1 pcs; Whole Milk 120 ml; Ice 150 g; Taro Powder 20 g |
| Cookies & Cream Milk Tea | Black Tea Bags 1 pcs; Whole Milk 120 ml; Ice 150 g; Cookies Crumble 20 g |
| Strawberry Soda | Soda Water 250 ml; Ice 150 g; Strawberry Puree 45 ml |
| Blueberry Soda | Soda Water 250 ml; Ice 150 g; Blueberry Puree 45 ml |
| Green Apple Soda | Soda Water 250 ml; Ice 150 g; Green Apple Puree 45 ml |
| Lychee Soda | Soda Water 250 ml; Ice 150 g; Lychee Puree 45 ml |
| Honey Peach Soda | Soda Water 250 ml; Ice 150 g; Honey Peach Puree 45 ml |
| Just Croffle | Croffle Dough 1 pcs; Powdered Sugar 5 g |
| S'mores | Croffle Dough 1 pcs; Marshmallows 20 g; Chocolate Chips 15 g |
| Banatella | Croffle Dough 1 pcs; Banana 0.5 pcs; Nutella 20 g |
| Biscoff Croffle | Croffle Dough 1 pcs; Biscoff Spread 20 g |
| Almond Nutella | Croffle Dough 1 pcs; Nutella 20 g; Almonds (sliced) 10 g |
| Ham & Cheese | Croffle Dough 1 pcs; Ham Slice 2 pcs; Cheese Slice 1 pcs |
| Flavored Fries | French Fries (frozen) 150 g; Frying Oil 15 ml |
| Nachos | Tortilla Chips 90 g; Nacho Cheese Sauce 40 g |
| Chicken Pop | Chicken Poppers (frozen) 150 g; Frying Oil 15 ml |

### Preparation assumptions

- **espresso:** 18 g dry dose per standard espresso; dial the yield to the café beans and basket. Hot drinks have no ice. Hot milk is steamed; cappuccino milk is foamed.
- **tea:** Brew one tea bag in approximately 150 ml potable water for 16 oz; two in 220 ml for 22 oz. Cool before adding 120/168 ml milk and ice. Brewing water is a preparation input, not a counted stock item.
- **americano:** Add approximately 180 ml potable water for iced 16 oz, 250 ml for 22 oz or 250 ml hot water for 12 oz. Water is not a counted stock item.
- **blended:** Chill extracted coffee before blending. Evaporated milk supplies the cream component for ice-blended frappes; Vanilla Milkshake instead uses milk and ice cream.
- **sweets:** Less Sweet halves the separately dosed syrup/sauce/condensed milk. It cannot remove sugar already present in puree, powder or ice cream. Extra Sweet adds 15 ml simple syrup.
- **foods:** Croffle dough is one ready-to-cook portion; do not also consume flour, butter and eggs. Melt chocolate chips for drizzle/smores. Frying oil is a 15 ml per-portion allocation, not the fryer fill volume. New ingredient counts start at zero.
- **pearls:** A 20 g dry tapioca allocation per topping portion assumes approximately 2.5x cooked yield; verify supplier yield during preparation.

Reference checks: [Breville espresso dosing](https://www.breville.com/au/en/coffee-journey/recipes/espresso.html), [Breville caramel frappe components](https://www.breville.com/inspiration/en-us/recipes/coffee-espresso/caramel-espresso-frappe), [Monin milkshake components](https://monin.us/products/french-vanilla-milkshake), [Lipton tea brewing](https://www.lipton.com/us/en/world-of-tea/how-to-make-milk-tea/). These support component plausibility, not Jayds-specific quantities or supplier yields.

## Verification and publication

The Customer browser journeys pass for 55 fixture products at nine viewport sizes, including return-navigation caching, today's-price changes during reorder, stock/error retries, one sold-out panel, required phone, cart/checkout retry, private account boundaries and offline recovery. The real service-worker suite passes with 140 cached resources, including a decoded WebP fixture and no private cached paths. Physical Android/iOS installation is not claimed.

The final hosted check passed for 53 published products, actual 320 px images for Coffee Latte/Vanilla Milkshake/Chicken Pop, one availability panel and no uncaught errors or attempted business writes. The initial sequential designated-account spot check returned the history-only endpoint in 2,279 ms and the previous full endpoint in 3,671 ms; a subsequent check returned 2,129 ms and 2,848 ms respectively. This account's history response was empty; these are not populated-history percentile benchmarks. The fixture checks cover actual populated recommendations and history beyond 200 orders. The final public screenshot check waits for hero-image decoding and verifies a sold-out product does not prompt for required choices. Final raw spot-check timings and private evidence hashes are recorded in [the sanitized evidence](evidence/2026-10-18-images-recipes.json).

| Status | Scope | Evidence/result |
| --- | --- | --- |
| PASS | Backend suite | 167 tests; no failures |
| PASS | Final stock retry, account boundaries, recipe/image checks | 19 focused tests; no failures |
| PASS | Customer browser journeys | 55 fixture products, nine viewport sizes, no runtime errors |
| PASS | Real service worker and offline recovery | 140 cached resources; public-only caching and draft preservation |
| PASS | Builds, type checks and lint | Customer/POS production builds and type checks; zero lint errors, one existing cleanup-ref warning |
| PASS | Hosted images and availability | 53 published products; responsive images decode; one sold-out notice; no required-choice prompt |
| PASS | Live recipes and historical preservation | All 55 products match the reviewed definitions; nine protected table hashes unchanged |
| FAIL | Unresolved checks in this release | None |
| BLOCKED | New ingredient stock availability | Four newly required ingredients remain at zero pending receiving/physical counts |
| NOT TESTED | Practical preparation and field performance | Actual supplier yield, finished drink volume, taste and production latency percentiles |
| NOT TESTED | Physical devices and complete provider outcomes | Installation, background push, payment/refund and delivery outcomes remain separate gates |

Customer final deployment: `dpl_5eLsyvN5RSj94i7kcWzqepVfzNfh`. POS deployment: `dpl_BZZ5Pdfm7wCgNNZR7uWxuJ3KyHdS`. Admin code is unchanged by this release; its product images and current recipe editor read the shared updated database. Existing separate local Admin edits were excluded from the release checkout.

Previous main `fc50a578c192fb1c300ca1d7d4805944eed10311` is preserved with tag `pre-image-recipe-2026-10-18`. Existing physical-device/payment/delivery gates from the combined release audit remain unchanged. Recipe and image backups remain private under ignored `.codex-logs/`; app rollback does not undo database changes. Supplier portions, topping headroom, finished drink volumes and taste still require practical confirmation.
