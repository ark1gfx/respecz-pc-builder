// Writes data/links.csv: one row per part with a Shopee search link to find the listing.
// Workflow: open each search link, pick a good listing, make its affiliate link in the
// affiliate portal (Product Offer > Get Link, or Custom Link with Sub ID "pcbuilder"),
// paste it in the shopeeUrl column, then run `npm run links:merge`.
import fs from 'node:fs';

const file = new URL('../data/parts.json', import.meta.url);
const out = new URL('../data/links.csv', import.meta.url);
const { parts } = JSON.parse(fs.readFileSync(file));
const q = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;

let existing = new Map();
if (fs.existsSync(out)) {
  for (const line of fs.readFileSync(out, 'utf8').split(/\r?\n/).slice(1)) {
    const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replaceAll('""', '"'));
    if (cols?.[0]) existing.set(cols[0], cols[4] || '');
  }
}

const rows = [['id', 'category', 'name', 'shopee_search', 'shopeeUrl'].join(',')];
for (const p of parts) {
  if (p.stock) continue;
  const search = `https://shopee.ph/search?keyword=${encodeURIComponent(p.search || p.name)}`;
  rows.push([p.id, p.category, p.name, search, existing.get(p.id) || p.shopeeUrl || ''].map(q).join(','));
}
fs.writeFileSync(out, rows.join('\n') + '\n');
console.log(`Wrote ${rows.length - 1} rows to data/links.csv`);
