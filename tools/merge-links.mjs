// Copies the shopeeUrl column of data/links.csv into data/parts.json.
// Only accepts Shopee links (shope.ee short links or shopee.ph / s.shopee.ph URLs).
import fs from 'node:fs';

const partsFile = new URL('../data/parts.json', import.meta.url);
const csvFile = new URL('../data/links.csv', import.meta.url);
if (!fs.existsSync(csvFile)) {
  console.error('Walang data/links.csv. Run muna: npm run links:todo');
  process.exit(1);
}

const parse = (line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)
  ?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replaceAll('""', '"')) || [];
const [header, ...lines] = fs.readFileSync(csvFile, 'utf8').split(/\r?\n/).filter(Boolean);
const cols = parse(header);
const iId = cols.indexOf('id');
const iUrl = cols.indexOf('shopeeUrl');
const allowed = /^https:\/\/(shope\.ee|s\.shopee\.ph|shopee\.ph)\//;

const data = JSON.parse(fs.readFileSync(partsFile));
const byId = new Map(data.parts.map((p) => [p.id, p]));
let updated = 0;
for (const line of lines) {
  const row = parse(line);
  const id = row[iId];
  const url = (row[iUrl] || '').trim();
  if (!url || !byId.has(id)) continue;
  if (!allowed.test(url)) {
    console.warn(`Skip ${id}: hindi Shopee link (${url})`);
    continue;
  }
  if (byId.get(id).shopeeUrl !== url) {
    byId.get(id).shopeeUrl = url;
    updated++;
  }
}
fs.writeFileSync(partsFile, JSON.stringify(data, null, 2) + '\n');
console.log(`Updated ${updated} links. Missing: ${data.parts.filter((p) => !p.stock && !p.shopeeUrl).length}`);
