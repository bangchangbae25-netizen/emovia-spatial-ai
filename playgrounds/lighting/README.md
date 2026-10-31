# EMOVIA VITTZ Lighting Source Candidate Registry

- 12 official VITTZ catalog records; source IDs are retailer `branduid`, not manufacturer model numbers.
- Scope: `CH_EMOVIA_LIGHTING_PLAYGROUND_V1`, common source contract `CH_EMOVIA_PLAYGROUND_COMMON_SOURCE_V1`.
- Catalog: `data/vittz-products.json` · page: `index.html`; existing homepage remains untouched.
- Auto-loading registers unique `VITTZ:<branduid>` keys in the browser's candidate registry, rejecting conflicting IDs.
- Repo branch holds staging records; no EMOVIA production database/API exists in this repo. Not an official release, live deployment, or operational activation.
- `FOUND -> CANDIDATE` only; `AVAILABLE != ACTIVATED != APPLIED`.
- No VITTZ product photos are copied. Source links and factual product options only.
- No exact photometric calculations, fixture shape/brand-image simulation, construction assurance, or assumed dimming.
- Options for color temperature often mean SKU variants, not live CCT changes; fixed vs switchable types are separated.
- The static demo keeps its generic sample space fixed; visuals are qualitative, not measured light response.
- For production, provide an authorized source-registry DB/API, approved rights, photometric data, and Master scope approval.
- Product changes require review; auto-scraping is disabled by default.
