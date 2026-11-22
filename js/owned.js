// "May parts na ako" mode: the visitor says what they already own, we list what fits.
// Pure functions + data: used by the browser and by node --test.
import { CATEGORY_LABEL, checkBuild, recommendedPsu } from './compat.js';

// Categories a visitor can say they own, in the order the form shows them.
export const OWNED_CATS = ['cpu', 'motherboard', 'ram', 'gpu', 'psu'];
// Categories we suggest for, in build order.
export const NEED_ORDER = ['motherboard', 'cpu', 'ram', 'gpu', 'psu', 'cooler', 'case', 'ssd'];

// Common parts people already have that are not (or no longer) sold in our catalog.
// Specs only, no links. GPU lengths are typical card sizes, not one exact model.
const cpu = (id, name, brand, socket, memTypes, tdp, cores, igpu, boxedCooler = true) =>
  ({ id, category: 'cpu', owned: true, name, brand, socket, memTypes, tdp, cores, igpu, boxedCooler });
const gpu = (id, name, vramGB, tdp, lengthMm, recPsuW) =>
  ({ id, category: 'gpu', owned: true, name, vramGB, tdp, lengthMm, recPsuW });

export const OWNED_PARTS = [
  cpu('o-cpu-5600g', 'AMD Ryzen 5 5600G', 'AMD', 'AM4', ['DDR4'], 65, '6C/12T', 1),
  cpu('o-cpu-4600g', 'AMD Ryzen 5 4600G', 'AMD', 'AM4', ['DDR4'], 65, '6C/12T', 1),
  cpu('o-cpu-5500', 'AMD Ryzen 5 5500', 'AMD', 'AM4', ['DDR4'], 65, '6C/12T', 0),
  cpu('o-cpu-3600', 'AMD Ryzen 5 3600', 'AMD', 'AM4', ['DDR4'], 65, '6C/12T', 0),
  cpu('o-cpu-5700x3d', 'AMD Ryzen 7 5700X3D', 'AMD', 'AM4', ['DDR4'], 105, '8C/16T', 0, false),
  cpu('o-cpu-10100f', 'Intel Core i3-10100F', 'Intel', 'LGA1200', ['DDR4'], 65, '4C/8T', 0),
  cpu('o-cpu-10400f', 'Intel Core i5-10400F', 'Intel', 'LGA1200', ['DDR4'], 65, '6C/12T', 0),
  cpu('o-cpu-10400', 'Intel Core i5-10400', 'Intel', 'LGA1200', ['DDR4'], 65, '6C/12T', 1),
  cpu('o-cpu-11400f', 'Intel Core i5-11400F', 'Intel', 'LGA1200', ['DDR4'], 65, '6C/12T', 0),
  cpu('o-cpu-12100f', 'Intel Core i3-12100F', 'Intel', 'LGA1700', ['DDR4', 'DDR5'], 58, '4C/8T', 0),
  cpu('o-cpu-12400f', 'Intel Core i5-12400F', 'Intel', 'LGA1700', ['DDR4', 'DDR5'], 65, '6C/12T', 0),
  cpu('o-cpu-13400f', 'Intel Core i5-13400F', 'Intel', 'LGA1700', ['DDR4', 'DDR5'], 65, '10C/16T', 0),

  { id: 'o-mb-am4', category: 'motherboard', owned: true, name: 'AM4 board (A320 / B450 / A520 / B550)', socket: 'AM4', memType: 'DDR4', biosNote: true },
  { id: 'o-mb-am5', category: 'motherboard', owned: true, name: 'AM5 board (A620 / B650 / X670)', socket: 'AM5', memType: 'DDR5' },
  { id: 'o-mb-1700-d4', category: 'motherboard', owned: true, name: 'Intel LGA1700 board, DDR4 (H610 / B660 / B760)', socket: 'LGA1700', memType: 'DDR4' },
  { id: 'o-mb-1700-d5', category: 'motherboard', owned: true, name: 'Intel LGA1700 board, DDR5 (B660 / B760 / Z790)', socket: 'LGA1700', memType: 'DDR5' },
  { id: 'o-mb-1200', category: 'motherboard', owned: true, name: 'Intel LGA1200 board (H410 / B460 / H510 / B560)', socket: 'LGA1200', memType: 'DDR4' },

  { id: 'o-ram-d4x1', category: 'ram', owned: true, name: 'DDR4, 1 stick', memType: 'DDR4', sticks: 1 },
  { id: 'o-ram-d4x2', category: 'ram', owned: true, name: 'DDR4, 2 sticks', memType: 'DDR4', sticks: 2 },
  { id: 'o-ram-d4x4', category: 'ram', owned: true, name: 'DDR4, 4 sticks', memType: 'DDR4', sticks: 4 },
  { id: 'o-ram-d5x1', category: 'ram', owned: true, name: 'DDR5, 1 stick', memType: 'DDR5', sticks: 1 },
  { id: 'o-ram-d5x2', category: 'ram', owned: true, name: 'DDR5, 2 sticks', memType: 'DDR5', sticks: 2 },

  gpu('o-gpu-1050ti', 'NVIDIA GTX 1050 Ti', 4, 75, 200, 300),
  gpu('o-gpu-1650', 'NVIDIA GTX 1650', 4, 75, 200, 300),
  gpu('o-gpu-1660s', 'NVIDIA GTX 1660 Super', 6, 125, 235, 450),
  gpu('o-gpu-2060', 'NVIDIA RTX 2060', 6, 160, 235, 500),
  gpu('o-gpu-3060', 'NVIDIA RTX 3060 12GB', 12, 170, 245, 550),
  gpu('o-gpu-4060', 'NVIDIA RTX 4060', 8, 115, 245, 550),
  gpu('o-gpu-rx580', 'AMD RX 580 8GB', 8, 185, 245, 500),
  gpu('o-gpu-rx6600', 'AMD RX 6600', 8, 132, 200, 450),

  ...[450, 550, 650, 750].map((w) => ({ id: `o-psu-${w}`, category: 'psu', owned: true, name: `${w}W power supply`, watts: w, formFactor: 'ATX' })),
];

// Generic boards/RAM do not say how many slots or what size, so those checks are skipped for them.
const byId = new Map(OWNED_PARTS.map((p) => [p.id, p]));

/** Options for the "ano'ng meron ka?" select: common owned parts first, then our catalog. */
export function ownedOptions(cat, parts) {
  return {
    common: OWNED_PARTS.filter((p) => p.category === cat),
    catalog: parts.filter((p) => p.category === cat && !p.stock).sort((a, b) => a.price - b.price),
  };
}

export function findOwned(id, catalogById) {
  return byId.get(id) || catalogById.get(id) || null;
}

/** Hash value for an owned set: "o-ram-d4x2,cpu-r5-5600". */
export function encodeOwned(owned) {
  return OWNED_CATS.map((c) => owned[c]?.id).filter(Boolean).join(',');
}

export function decodeOwned(value, catalogById) {
  const owned = {};
  for (const id of String(value || '').split(',')) {
    const p = findOwned(id.trim(), catalogById);
    if (p && OWNED_CATS.includes(p.category) && !owned[p.category]) owned[p.category] = p;
  }
  return owned;
}

// "No display" is not a fit problem here: the GPU is suggested in its own list.
export const fits = (owned, cat, p) => !checkBuild({ ...owned, [cat]: p }).some((r) => r.level === 'fail' && r.key !== 'display');

// Up to `limit` picks, one per key first (e.g. one board per socket) so the visitor sees every route.
function diverse(list, keyOf, limit) {
  const out = [];
  const seen = new Set();
  for (const p of list) if (!seen.has(keyOf(p))) { seen.add(keyOf(p)); out.push(p); }
  for (const p of list) if (out.length < limit && !out.includes(p)) out.push(p);
  return out.slice(0, Math.max(limit, seen.size)).sort((a, b) => a.price - b.price);
}

const SOCKET_HINT = {
  AM4: 'AM4 = Ryzen 1000–5000',
  AM5: 'AM5 = Ryzen 7000–9000 (DDR5)',
  LGA1700: 'LGA1700 = Intel 12th–14th gen',
  LGA1200: 'LGA1200 = Intel 10th–11th gen',
};

/**
 * What fits the parts the visitor already has.
 * @returns {{notes: {level:string,key:string,text:string}[], needs: {cat:string, total:number, picks:object[], empty?:string, hint?:string}[]}}
 */
export function suggestForOwned(owned, parts, { limit = 3 } = {}) {
  const have = Object.fromEntries(OWNED_CATS.map((c) => [c, owned[c] || null]));
  const notes = checkBuild(have).filter((r) => r.key !== 'missing' && r.key !== 'display');
  if (have.motherboard?.biosNote && have.cpu && /Ryzen \d 5\d{3}/.test(have.cpu.name)) {
    notes.push({ level: 'warn', key: 'bios', text: 'Kung A320 o B450 ang board, baka kailangan ng BIOS update para sa Ryzen 5000. Itanong sa seller o i-update muna gamit ang lumang CPU.' });
  }
  if (have.cpu && !have.cpu.igpu && !have.gpu) {
    notes.push({ level: 'warn', key: 'display', text: `Walang built-in graphics ang ${have.cpu.name}, kailangan ng GPU para may display.` });
  }

  const needs = [];
  for (const cat of NEED_ORDER) {
    if (have[cat]) continue;
    let list = parts.filter((p) => p.category === cat && !p.stock && fits(have, cat, p)).sort((a, b) => a.price - b.price);
    let picks;
    if (cat === 'motherboard' || cat === 'cpu') picks = diverse(list, (p) => p.socket, limit);
    else if (cat === 'psu') {
      const rec = recommendedPsu(have);
      list = [...list.filter((p) => p.watts >= rec), ...list.filter((p) => p.watts < rec)];
      picks = list.slice(0, limit);
    } else picks = list.slice(0, limit);

    const need = { cat, total: list.length, picks };
    if (cat === 'motherboard' || cat === 'cpu') {
      const sockets = [...new Set(picks.map((p) => p.socket))];
      if (sockets.length) need.hint = sockets.map((s) => SOCKET_HINT[s]).filter(Boolean).join(' · ');
    }
    if (cat === 'cooler' && have.cpu?.boxedCooler) need.hint = `Optional: may kasamang stock cooler ang ${have.cpu.name}. Upgrade lang kung gusto mong mas malamig at tahimik.`;
    if (cat === 'gpu' && have.cpu?.igpu) need.hint = `Optional: may built-in graphics ang ${have.cpu.name}, pwedeng GPU later.`;
    if (!list.length) {
      const socket = have.cpu?.socket || have.motherboard?.socket;
      need.empty = socket === 'LGA1200' && (cat === 'motherboard' || cat === 'cpu')
        ? 'Luma na ang LGA1200, wala na sa Shopee Mall list namin. Second-hand o ibang shop muna, o mag-upgrade sa LGA1700.'
        : `Wala pa kaming ${CATEGORY_LABEL[cat]} na swak sa parts mo.`;
    }
    needs.push(need);
  }
  return { notes, needs };
}
