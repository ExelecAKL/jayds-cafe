# Continuous menu categories — 8 October 2026

The customer menu is now one continuous catalog, divided into named category sections in the published category order. The All filter is removed. Selecting a category scrolls to its heading instead of hiding other categories, and the highlighted category follows the current section as the customer scrolls. The rail scrolls independently to keep its active category visible.

Search still covers the entire published menu and groups matching products under their categories. Clearing search restores every product. Published products without a matching category remain available under More favorites. Product names, prices, availability, favorites and customization links retain their existing behavior.

Phone, tablet, landscape and desktop use the same side rail, section headings, product-card treatment and pickup/delivery context. Product columns and spacing adapt to available width. Short landscape screens have a more compact header and rail. The narrow browser-zoom fallback retains a horizontal category rail and single product column.

Returning from a product restores the category and position within it. Opening a product during an unfinished category-scroll animation captures that product's section before navigation, so subsequent scroll events cannot overwrite the saved location. Restoration also handles cached page reactivation. Reduced-motion preferences use immediate category jumps.

## Verification

- Customer production build, customer/scripts TypeScript checks and changed-file ESLint passed.
- The isolated production-browser demo passed with 55 products across seven category sections at 360×800, 390×844, 430×932, 768×1024, 834×1112, 844×390, 1024×768, 1180×820 and 1280×900.
- The demo verified no All button, no missing products on category selection, category jumps, scroll highlighting, active rail visibility, return from product details, global search, fulfillment controls and no horizontal page overflow.
- Existing customization, cart recovery, favorites, checkout retries, address selection, voucher/points review and account flows passed in the same isolated demo, with no runtime errors.
- Phone, tablet and phone-landscape screenshots were visually inspected.
- The real service-worker demo passed public-cache restrictions, offline menu/product reload, offline draft editing and reconnection without losing notes. It also exercised uncategorized products in More favorites, with no runtime errors.

The browser demo uses isolated fixtures and creates no hosted business transactions. This change does not modify the catalog API, database, payment providers or staff/Admin applications.
