# ReSpecz PC Builder

Static site: pick a budget and use case (Gaming, Editing, School/Office) and it suggests a
compatible parts list with Shopee affiliate links. No framework, no build step.

```
index.html  styles.css
js/compat.js   compatibility rules (socket, RAM type/slots, form factor, GPU length,
               cooler socket/height/TDP, PSU wattage, iGPU, M.2) — pure functions
js/picker.js   budget + use-case suggestion (best CPU/GPU score that fits, then spends
               leftover one tier at a time in the use case's priority order)
js/app.js      UI, part swapping, shareable #hash links, sample builds
data/parts.json   hand-curated catalog (specs + approx price + shopeeUrl)
data/builds.json  sample builds
tools/            link helpers
test/             node --test
```

## Run

```bash
npm start          # http://localhost:4870
npm test
```

## Affiliate links (until the Open API is granted)

1. `npm run links:todo` writes `data/links.csv` with a Shopee search link per part.
2. For each row, choose a good listing (official store / Shopee Mall preferred), then make the
   affiliate link in affiliate.shopee.ph: **Product Offer → Get Link** (or **Batch Get Link**,
   up to 100, then download the CSV from Export Management), or **Custom Link** with
   Sub ID `pcbuilder`.
3. Paste each link in the `shopeeUrl` column, then `npm run links:merge`.

Parts without a link show "Hanapin sa Shopee" (plain search, no commission).

`tools/catalog-2026-11-22.py` holds the current catalog (10 parts added 2026-11-23, marked with their own priceChecked): every part is a Shopee Mall listing
(Preferred Seller had none of the missing models) with its affiliate link (Sub_id1
`pcbuilder`, Sub_id2 = part tag), item ID and the variant price checked on 2026-11-22.
Edit that file and re-run it to change parts or prices. Case and GPU sizes are approximate
manufacturer figures. Product photos are not used; the site uses its own icons.

## Upgrade path: Shopee Affiliate Open API

When AppID + Secret are granted, add a script (local or GitHub Action, secrets in repo
secrets, never in the site) that, per part with a `shopeeItemId`, calls `productOfferV2`
for current price/image and `generateShortLink` (subIds `["pcbuilder", partId]`) and writes
them back to `parts.json`. Specs stay hand-curated.

## Deploy (GitHub Pages)

Push this folder to a repo (e.g. `respecz-pc-builder`) and enable Pages on `main` / root.
Every path is relative, so it works under `/respecz-pc-builder/`.
