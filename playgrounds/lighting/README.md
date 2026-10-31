# EMOVIA Lighting Playground — Visible Beta 0.2

## What is built
Open `/playgrounds/lighting/` on the static site. The beta provides:
- Three photographic sample rooms (living room, kitchen, retail) under the Unsplash License.
- Seven *generic* fixture types: downlight, linear/indirect, track spot, pendant, under-cabinet, wall accent, floor.
- Five immediate mood presets; tone, relative brightness, focus, day/night, A/B slider, photo-preserving visual overlays.
- User photo selection that stays local to the browser session (object URL only, not uploaded).
- Ten latest generic demo combinations saved in localStorage for preset rooms, JSON copy.
- Reference links from VITTZ's online retail catalog, not a claim that VITTZ manufactured generic fixtures.

## Source and rights
- VITTZ is the merchant / public-catalog reference, not automatically the manufacturer or brand of the products listed.
- File `data/vittz-products.json` contains 12 catalog-reference records with `VITTZ:<branduid>` merchant keys.
- No product photos from VITTZ have been reproduced, and **no actual VITTZ optical/product fidelity** is claimed.
- Photographic examples:
  - Living: GoodLifeConstruction, https://unsplash.com/photos/modern-living-room-with-minimalist-furniture-and-decor-e0oJLc5FYsg
  - Kitchen: GoodLifeConstruction, https://unsplash.com/photos/modern-kitchen-with-island-and-bar-stools-qslhV6cdYGw
  - Retail: Zooey Li, https://unsplash.com/photos/modern-retail-store-interior-with-display-shelves-and-products-lkDZJL5psKU
  These photo credits are visible in the UI. Additional restrictions may apply to branded products or artworks depicted in stock photography.

## Limitations
- The preview applies broad visual tone, contrast, and light overlays to *the same photo*. It does not compute true luminous flux, lighting design, IES, actual product shape, or installation compliance.
- A fixture selection changes a **generic lighting effect type** and supported candidate zone, not a manufacturer's physical lighting performance.
- Product Source record status is `FOUND / CANDIDATE`, activation `INACTIVE`, application `NOT_APPLIED` until real backend and rights verification.
- The photo upload is client-only; user-uploaded images are not sent to a server or stored in localStorage.
- No API backend, server database, paid sales connector, and no validated +95 engine.

## Publishing
The original repository homepage `index.html`, `app.js`, `app/globals.css` remains untouched. The beta lives in the separate `playgrounds/lighting/` directory. Static hosting must publish that directory for it to be publicly accessible. GitHub Pages deployment configuration is not managed in this changeset.

## Validation
- Script syntax checked using JavaScript parser.
- All three photo pages and their direct CDN image IDs checked as Unsplash photographs.
- Need real browser desktop/mobile end-to-end testing and public Pages deployment confirmation; those are not implied by repository commits.
