// Suggests a compatible build for a budget and use case.
import { CATEGORIES, checkBuild, hasFail, recommendedPsu, totalPrice } from './compat.js';

export const USE_CASES = {
  gaming: {
    label: 'Gaming',
    hint: 'Valorant, Dota 2, CS2, Roblox',
    wCpu: 0.35,
    wGpu: 0.65,
    minRam: 16,
    minSsd: 500,
    upgrades: ['ssd', 'ram', 'case', 'cooler', 'motherboard'],
  },
  editing: {
    label: 'Editing',
    hint: 'Premiere, CapCut, DaVinci, Blender',
    wCpu: 0.55,
    wGpu: 0.45,
    minRam: 32,
    minSsd: 1000,
    fallbackRam: 16,
    multiCore: true,
    upgrades: ['ram', 'ssd', 'cooler', 'motherboard', 'case'],
  },
  school: {
    label: 'School / Office',
    short: 'School',
    hint: 'Docs, Zoom, browsing, light games',
    wCpu: 0.75,
    wGpu: 0.25,
    minRam: 16,
    minSsd: 500,
    maxGpuPerf: 50,
    maxCpuPerf: 86,
    upgrades: ['ssd', 'ram', 'motherboard', 'case'],
  },
};

// Visitor preferences. 'any' = no filter.
export const PREFS = {
  cpuBrand: { label: 'CPU brand', options: [['any', 'Kahit ano'], ['AMD', 'AMD Ryzen'], ['Intel', 'Intel Core']] },
  gpuBrand: { label: 'GPU brand', options: [['any', 'Kahit ano'], ['NVIDIA', 'NVIDIA GeForce'], ['AMD', 'AMD Radeon']] },
  formFactor: { label: 'Laki ng PC (motherboard)', options: [['any', 'Kahit ano'], ['ATX', 'ATX'], ['mATX', 'Micro-ATX'], ['ITX', 'Mini-ITX']] },
};
export const DEFAULT_PREFS = { cpuBrand: 'any', gpuBrand: 'any', formFactor: 'any' };

// GPU chip maker (the card brand is MSI/ASUS/etc., the chip is NVIDIA or AMD)
export function gpuVendor(p) {
  if (p.chipVendor) return p.chipVendor;
  const t = `${p.id} ${p.name}`;
  if (/geforce|\brtx|\bgtx/i.test(t)) return 'NVIDIA';
  if (/radeon|\brx[\s-]?\d/i.test(t)) return 'AMD';
  if (/\barc\b/i.test(t)) return 'Intel';
  return null;
}

function prefFilters(prefs = {}) {
  const pr = { ...DEFAULT_PREFS, ...prefs };
  return {
    pr,
    cpu: (c) => pr.cpuBrand === 'any' || c.brand === pr.cpuBrand,
    gpu: (g) => pr.gpuBrand === 'any' || gpuVendor(g) === pr.gpuBrand,
    motherboard: (m) => pr.formFactor === 'any' || m.formFactor === pr.formFactor,
  };
}

/** Which preference options the catalog can serve at all (used to grey out empty choices). */
export function availablePrefs(parts) {
  const has = (cat, pred) => parts.some((p) => p.category === cat && pred(p));
  return {
    cpuBrand: Object.fromEntries(PREFS.cpuBrand.options.map(([v]) => [v, v === 'any' || has('cpu', (c) => c.brand === v)])),
    gpuBrand: Object.fromEntries(PREFS.gpuBrand.options.map(([v]) => [v, v === 'any' || has('gpu', (g) => gpuVendor(g) === v)])),
    formFactor: Object.fromEntries(PREFS.formFactor.options.map(([v]) => [v, v === 'any' || has('motherboard', (m) => m.formFactor === v)])),
  };
}

const byPrice = (a, b) => a.price - b.price;
const cheapest = (list, pred) => list.filter(pred).sort(byPrice)[0] || null;

function group(parts) {
  const g = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const p of parts) g[p.category]?.push(p);
  return g;
}

// Cheapest complete build around a fixed CPU + GPU, or null if the catalog can't make one.
function baseBuild(g, cpu, gpu, minRam, minSsd, okBoard = () => true) {
  let best = null;
  for (const mb of g.motherboard) {
    if (!okBoard(mb)) continue;
    if (mb.socket !== cpu.socket || !cpu.memTypes.includes(mb.memType)) continue;
    if (mb.vrmMaxTdp && cpu.tdp > mb.vrmMaxTdp) continue;
    const ram = cheapest(g.ram, (r) => r.memType === mb.memType && r.capacityGB >= minRam && r.sticks <= mb.memSlots);
    if (!ram) continue;
    if (!best || mb.price + ram.price < best.motherboard.price + best.ram.price) best = { motherboard: mb, ram };
  }
  if (!best) return null;

  const build = { cpu, gpu, ...best };
  build.ssd = cheapest(g.ssd, (s) => s.capacityGB >= minSsd && (s.interface !== 'NVMe' || best.motherboard.m2Slots > 0));
  build.psu = cheapest(g.psu, (p) => p.watts >= recommendedPsu(build));
  build.case = cheapest(g.case, (c) => c.formFactors.includes(best.motherboard.formFactor) && (!gpu || gpu.lengthMm <= c.maxGpuMm));
  if (!build.ssd || !build.psu || !build.case) return null;

  const stock = g.cooler.find((c) => c.stock);
  build.cooler = cpu.boxedCooler && stock && cpu.tdp <= stock.tdpRating
    ? stock
    : cheapest(g.cooler, (c) => !c.stock && c.type === 'air' && c.sockets.includes(cpu.socket) && c.heightMm <= build.case.maxCoolerMm && c.tdpRating >= cpu.tdp);
  if (!build.cooler) return null;
  return build;
}

function score(profile, build) {
  const gpuPerf = build.gpu ? build.gpu.perf : build.cpu.igpu;
  const cpuPerf = profile.multiCore ? (build.cpu.perfMulti ?? build.cpu.perf) : build.cpu.perf;
  return profile.wCpu * cpuPerf + profile.wGpu * gpuPerf;
}

// Spend leftover money on better parts: one tier step per category per round, in the
// use case's priority order, so the money spreads out instead of all going to one part.
function upgrade(g, build, budget, profile, allowed = {}) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const cat of profile.upgrades) {
      const current = build[cat];
      const leftover = budget - totalPrice(build);
      const next = g[cat]
        .filter((p) => !p.stock && p.tier > (current?.tier ?? -1) && p.price - (current?.price || 0) <= leftover)
        .filter((p) => !allowed[cat] || allowed[cat](p))
        .filter((p) => !checkBuild({ ...build, [cat]: p }).some((r) => r.level !== 'ok' && r.key !== 'missing'))
        .sort((a, b) => a.tier - b.tier || a.price - b.price)[0];
      if (next) {
        build[cat] = next;
        changed = true;
      }
    }
  }
  return build;
}

/**
 * @returns {{build: object, total: number} | {error: string, minBudget: number}}
 */
export function suggestBuild(parts, budget, useCase, prefs = {}) {
  const profile = USE_CASES[useCase] || USE_CASES.gaming;
  const g = group(parts);
  const f = prefFilters(prefs);
  // a chosen GPU brand means the visitor wants a graphics card, so no "built-in graphics" builds then
  const gpus = [
    ...(f.pr.gpuBrand === 'any' ? [null] : []),
    ...g.gpu.filter((x) => f.gpu(x) && (!profile.maxGpuPerf || x.perf <= profile.maxGpuPerf)),
  ];
  const ramSteps = profile.fallbackRam ? [profile.minRam, profile.fallbackRam] : [profile.minRam];

  let best = null;
  let minTotal = Infinity;
  for (const minRam of ramSteps) {
    for (const cpu of g.cpu) {
      if (profile.maxCpuPerf && cpu.perf > profile.maxCpuPerf) continue;
      if (!f.cpu(cpu)) continue;
      for (const gpu of gpus) {
        if (!gpu && !cpu.igpu) continue;
        const build = baseBuild(g, cpu, gpu, minRam, profile.minSsd, f.motherboard);
        if (!build) continue;
        const total = totalPrice(build);
        minTotal = Math.min(minTotal, total);
        if (total > budget || hasFail(checkBuild(build))) continue;
        const s = score(profile, build);
        if (!best || s > best.s || (s === best.s && total < best.total)) best = { build, total, s };
      }
    }
    if (best) break;
  }

  if (!best && minTotal === Infinity) {
    // not a budget problem: no part in the list matches this mix of choices
    return { error: 'Walang tugmang parts sa listahan para sa mga napili mo.', noMatch: true };
  }
  if (!best) {
    return { error: 'Kulang ang budget para sa kumpletong build.', minBudget: Math.ceil(minTotal / 1000) * 1000 };
  }
  const build = upgrade(g, { ...best.build }, budget, profile, { motherboard: f.motherboard });
  return { build, total: totalPrice(build) };
}
