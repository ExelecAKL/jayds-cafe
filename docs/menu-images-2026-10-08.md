# Menu images — 8 October 2026

Generated and visually reviewed a transparent PNG for each of the 55 menu item IDs. Drink cups carry the approved coffee-sipping mascot. Croffles are standalone cutouts. Nachos, Flavored Fries, and Chicken Pop use kraft carton trays with the approved horizontal wordmark across the front.

The full-resolution images, catalog snapshot, prompts, alpha checks, gallery, and publication record are under `assets/menu-products/`. Generated illustrations represent the catalog's base/default presentation; actual owner packaging and portions still need confirmation.

Uploaded 55 content-hashed app-size PNGs to the public `jayds-menu-images` bucket. Every returned image was checked against its local SHA-256 hash before updating any menu links. All 55 `menu_items.image_url` fields were then verified against the publication record; product availability was preserved. All three configured applications share that database.

The shared image helper retains API/owner image precedence and supplies local fallbacks by item ID. Product cutouts use `object-fit: contain`. Admin catalog rows now include thumbnails. Customer images are cached as viewed, including the narrowly scoped public storage path, instead of including the entire pack in installation precache. Windows manifest path separators are normalized before filtering.

Validation passed: 55 PNG alpha/completeness checks, workspace TypeScript, focused ESLint, all three production builds, and the isolated real-service-worker browser test. That browser check confirmed only the viewed Americano image was cached, offline menu reload and draft editing worked, reconnection retained the draft, no private pages/API responses entered Cache Storage, and no runtime errors occurred. Real iOS/Android hardware was not tested.

No orders, payments, courier bookings, stock changes, or loyalty transactions were created by these checks.
