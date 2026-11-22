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

const byPrice = (a, b) => a.price - b.price;
const cheapest = (list, pred) => list.filter(pred).sort(byPrice)[0] || null;

function group(parts) {
  const g = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const p of parts) g[p.category]?.push(p);
  return g;
}

// Cheapest complete build around a fixed CPU + GPU, or null if the catalog can't make one.
function baseBuild(g, cpu, gpu, minRam, minSsd) {
  let best = null;
  for (const mb of g.motherboard) {
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
function upgrade(g, build, budget, profile) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const cat of profile.upgrades) {
      const current = build[cat];
      const leftover = budget - totalPrice(build);
      const next = g[cat]
        .filter((p) => !p.stock && p.tier > (current?.tier ?? -1) && p.price - (current?.price || 0) <= leftover)
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
export function suggestBuild(parts, budget, useCase) {
  const profile = USE_CASES[useCase] || USE_CASES.gaming;
  const g = group(parts);
  const gpus = [null, ...g.gpu.filter((x) => !profile.maxGpuPerf || x.perf <= profile.maxGpuPerf)];
  const ramSteps = profile.fallbackRam ? [profile.minRam, profile.fallbackRam] : [profile.minRam];

  let best = null;
  let minTotal = Infinity;
  for (const minRam of ramSteps) {
    for (const cpu of g.cpu) {
      if (profile.maxCpuPerf && cpu.perf > profile.maxCpuPerf) continue;
      for (const gpu of gpus) {
        if (!gpu && !cpu.igpu) continue;
        const build = baseBuild(g, cpu, gpu, minRam, profile.minSsd);
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

  if (!best) {
    return { error: 'Kulang ang budget para sa kumpletong build.', minBudget: Math.ceil(minTotal / 1000) * 1000 };
  }
  const build = upgrade(g, { ...best.build }, budget, profile);
  return { build, total: totalPrice(build) };
}
