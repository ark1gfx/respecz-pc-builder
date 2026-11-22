// Compatibility rules for a PC build. Pure functions: used by the browser and by node --test.

export const CATEGORIES = ['cpu', 'motherboard', 'ram', 'gpu', 'ssd', 'psu', 'case', 'cooler'];
export const OPTIONAL = new Set(['gpu']);

export const CATEGORY_LABEL = {
  cpu: 'CPU',
  motherboard: 'Motherboard',
  ram: 'RAM',
  gpu: 'Graphics card (GPU)',
  ssd: 'SSD',
  psu: 'Power supply (PSU)',
  case: 'Case',
  cooler: 'CPU cooler',
};

// Estimated full-load draw: CPU + GPU + ~80 W for board, RAM, SSD and fans.
export function estimateLoad(build) {
  return (build.cpu?.tdp || 0) + (build.gpu?.tdp || 0) + 80;
}

// Recommended PSU: 50% headroom over the load, rounded up to 50 W, never below the GPU maker's figure.
export function recommendedPsu(build) {
  const load = estimateLoad(build);
  return Math.max(Math.ceil((load * 1.5) / 50) * 50, build.gpu?.recPsuW || 0);
}

// Minimum before we call it unsafe: 25% over the load and no more than 50 W under the GPU maker's figure.
export function minimumPsu(build) {
  return Math.max(Math.ceil(estimateLoad(build) * 1.25), (build.gpu?.recPsuW || 0) - 50);
}

export function totalPrice(build) {
  return CATEGORIES.reduce((sum, c) => sum + (build[c]?.price || 0), 0);
}

/**
 * @param {Record<string, object|null>} build parts keyed by category
 * @returns {{level:'ok'|'warn'|'fail', key:string, text:string}[]}
 */
export function checkBuild(build) {
  const out = [];
  const add = (level, key, text) => out.push({ level, key, text });
  const { cpu, motherboard: mb, ram, gpu, ssd, psu, cooler } = build;
  const pcCase = build.case;

  const missing = CATEGORIES.filter((c) => !build[c] && !OPTIONAL.has(c));
  if (missing.length) add('warn', 'missing', `Kulang pa: ${missing.map((c) => CATEGORY_LABEL[c]).join(', ')}`);

  if (cpu && mb) {
    if (cpu.socket !== mb.socket) add('fail', 'socket', `Hindi kasya: ${cpu.socket} ang CPU pero ${mb.socket} ang motherboard.`);
    else add('ok', 'socket', `Socket ${cpu.socket}: swak ang CPU at motherboard.`);
    if (cpu.socket === mb.socket && !cpu.memTypes.includes(mb.memType)) {
      add('fail', 'cpu-mem', `Hindi supported ng ${cpu.name} ang ${mb.memType}.`);
    }
  }

  if (cpu && mb && cpu.socket === mb.socket && mb.vrmMaxTdp && cpu.tdp > mb.vrmMaxTdp) {
    add('warn', 'vrm', `Entry-level board para sa ${cpu.tdp}W CPU. Pwedeng mag-throttle; mas swak ang mas mataas na chipset.`);
  }

  if (ram && mb) {
    if (ram.memType !== mb.memType) add('fail', 'ram-type', `${ram.memType} ang RAM pero ${mb.memType} ang board. Hindi papasok sa slot.`);
    else if (mb.memSlots && ram.sticks > mb.memSlots) add('fail', 'ram-slots', `${ram.sticks} sticks ang RAM pero ${mb.memSlots} slots lang ang board.`);
    else add('ok', 'ram-type', `${ram.memType}${ram.capacityGB ? ` ${ram.capacityGB}GB` : ''}, ${ram.sticks > 1 ? 'dual channel' : 'single stick'}.`);
  }

  if (cpu && ram && !mb && !cpu.memTypes.includes(ram.memType)) {
    add('fail', 'cpu-ram', `Hindi supported ng ${cpu.name} ang ${ram.memType} RAM.`);
  }

  if (mb?.formFactor && pcCase) {
    if (!pcCase.formFactors.includes(mb.formFactor)) add('fail', 'form-factor', `${mb.formFactor} ang board, hindi kasya sa ${pcCase.name}.`);
    else add('ok', 'form-factor', `${mb.formFactor} board, kasya sa case.`);
  }

  if (gpu && pcCase) {
    if (gpu.lengthMm > pcCase.maxGpuMm) add('fail', 'gpu-length', `${gpu.lengthMm}mm ang GPU, ${pcCase.maxGpuMm}mm lang ang kaya ng case.`);
    else add('ok', 'gpu-length', `GPU ${gpu.lengthMm}mm, may space sa case (max ${pcCase.maxGpuMm}mm).`);
  }

  if (cpu && !gpu) {
    if (!cpu.igpu) add('fail', 'display', `Walang display! Walang built-in graphics ang ${cpu.name}, kailangan ng GPU.`);
    else add('ok', 'display', 'Built-in graphics muna, pwedeng dagdagan ng GPU later.');
  }

  if (ssd && mb && ssd.interface === 'NVMe' && mb.m2Slots === 0) {
    add('fail', 'm2', 'Walang M.2 slot ang board para sa NVMe SSD.');
  }

  if (cooler && cpu) {
    if (cooler.stock) {
      if (!cpu.boxedCooler) add('fail', 'cooler', `Walang kasamang cooler ang ${cpu.name}, bumili ng hiwalay.`);
      else if (cpu.tdp > cooler.tdpRating) add('warn', 'cooler', 'Mainit ang CPU para sa stock cooler.');
      else add('ok', 'cooler', 'Stock cooler, sapat sa CPU na ito.');
    } else {
      if (!cooler.sockets.includes(cpu.socket)) add('fail', 'cooler', `Hindi supported ng cooler ang ${cpu.socket}.`);
      else if (cooler.tdpRating < cpu.tdp) add('warn', 'cooler', `Kulang ang cooler (${cooler.tdpRating}W) para sa ${cpu.tdp}W CPU.`);
      else add('ok', 'cooler', `Cooler kaya ang ${cpu.tdp}W CPU.`);
    }
  }

  if (cooler && pcCase && !cooler.stock) {
    if (cooler.type === 'aio' && !pcCase.rad240) add('fail', 'cooler-fit', 'Walang 240mm radiator mount ang case.');
    if (cooler.type === 'air' && cooler.heightMm > pcCase.maxCoolerMm) {
      add('fail', 'cooler-fit', `${cooler.heightMm}mm ang cooler, ${pcCase.maxCoolerMm}mm lang ang kasya sa case.`);
    }
  }

  if (psu && pcCase && !pcCase.psuFormFactors.includes(psu.formFactor)) {
    add('fail', 'psu-fit', `${psu.formFactor} PSU, hindi kasya sa case.`);
  }

  if (psu && cpu) {
    const load = estimateLoad(build);
    const rec = recommendedPsu(build);
    if (psu.watts < minimumPsu(build)) add('fail', 'psu', `${psu.watts}W ay kulang. ~${load}W ang load, ${rec}W ang recommended.`);
    else if (psu.watts < rec) add('warn', 'psu', `${psu.watts}W ay pwede pero manipis ang allowance. ${rec}W ang mas safe.`);
    else add('ok', 'psu', `${psu.watts}W PSU para sa ~${load}W load. May allowance.`);
  }

  return out;
}

export function hasFail(results) {
  return results.some((r) => r.level === 'fail');
}
