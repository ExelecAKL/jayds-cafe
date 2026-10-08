# Jayd’s menu product images

Transparent PNG illustrations for the complete 55-item catalog captured on October 8, 2026. One image represents each item’s base/default presentation. Optional customizations are excluded unless the product description includes them.

- Drink cups use the approved Jayd’s mascot as a cup label. The mascot does not appear beside food or float outside the cup.
- Drinks use a consistent clear plastic cup and the menu’s default iced presentation. Serving vessels and portions still need the owner’s confirmation; these are generated illustrations, not photographs of actual café servings.
- Croffles are clean cutouts with no mascot, decorative props, plates, or background. Nachos, Flavored Fries, and Chicken Pop use shallow kraft carton trays with the approved horizontal wordmark printed across the wide front panel.
- Coming-soon products receive assets without changing their availability.
- The images keep real alpha transparency. Preview backgrounds are only for inspection.

`images/` contains the final assets. Open `gallery.html` to filter items, inspect their transparency on different backgrounds, and download individual PNGs. `prompts.json` and `manifest.json` preserve the product descriptions, generation instructions, source paths, and transparency checks. `catalog.json` is the read-only catalog snapshot used for this set. `mascot-reference.png` is a raster rendering of the authoritative mascot SVG used as the generation reference.

Generation uses the built-in ImageGen tool. No image API or CLI fallback is used. `horizontal-logo-reference.png` is rendered from the authoritative horizontal SVG for the snack packaging.

Run `node scripts/menu-image-assets.mjs verify` to check completeness and alpha. Run `node scripts/menu-image-assets.mjs sheet all` for a labeled preview. Run `node scripts/menu-image-gallery.mjs` to rebuild the gallery. Run `node scripts/prepare-menu-images.mjs` to prepare 768px transparent PNGs in the three applications’ public folders; their development and production build hooks do this automatically. The full-resolution originals remain in `images/`. Customer product images are cached as viewed rather than all downloaded during PWA installation.

The shared product-image helper uses item IDs to select generated images only when an item has no owner-supplied photo. This keeps real photos authoritative and works with the customer, `/staff`, and `/admin` base paths.

`node scripts/publish-menu-images.mjs` performs a read-only publication check. `node scripts/publish-menu-images.mjs --apply` uploads app-size PNGs into the public `jayds-menu-images` Supabase Storage bucket, verifies their returned bytes, and updates only the matching menu items’ `image_url` fields. It requires the configured server key, uses content-hashed filenames for safe retries, checks that all three apps share the database, and preserves availability. No credential is written to the publication record or source code. `publication.json` records the published URLs and verification.

All 55 assets were uploaded and their shared menu links verified on October 8, 2026. The Mobile App, POS, and Admin consume those same API image URLs. The original full-resolution pack totals 82,075,675 bytes; the 768px app set totals 33,563,252 bytes and loads lazily.
