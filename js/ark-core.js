// Ark, ang Assistant ni ReSpecz: the answer engine, no DOM.
// 1) computeAnswer(): questions that name real parts ("kaya ba ng 550W ang RTX 5060?") are answered from
//    data/parts.json, so the numbers always match the catalog.
// 2) match(): everything else is matched against the knowledge base in data/ark.json with Taglish synonyms,
//    keyword weights and typo tolerance. No server, no AI model: every answer is written by ReSpecz.

// ---------- text ----------
const STOP = new Set(['ang ng nang sa si ni ay at ba po pa na nga lang lng din rin yung yong mga ko mo ka ako ikaw siya '
  + 'ito iyan iyon yan yun dito diyan dyan kasi kaya pero o kung para may meron mayroon wala hindi di ung un nung noong '
  + 'naman talaga sana pala daw raw ha eh e oh hm hmm pls please ano anong ba ganun ganon tsaka saka '
  + 'the a an is are am my your i you me it to of in on for and or be do does can with this that what how why '
  + 'bro pre idol boss sir maam lods lodi tol par pc computer kompyuter mag nag pag naka ma walang wala'].join('').split(' '));
// question words that carry no topic: kept out of the score, the topic words decide
const isStop = (t) => STOP.has(t);
const SOFT = new Set(['paano', 'pano', 'paanu', 'bakit', 'saan', 'kailan', 'pwede', 'kailangan', 'gagawin']);

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\s*(gb|tb|w|mm|hz)\b/g, '$1$2') // "16 gb" → "16gb", "550 w" → "550w"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Replace synonym phrases with one canonical token ("black screen" → "walang_display"). Longest first. */
export function applySynonyms(norm, synonyms) {
  let words = norm.split(' ').filter(Boolean);
  for (const [phrase, canon] of synonymList(synonyms)) {
    const pw = phrase.split(' ');
    for (let i = 0; i + pw.length <= words.length; i++) {
      // each word equal, or one typo in a word of 5+ letters ("dispaly" = "display")
      const hit = pw.every((w, j) => words[i + j] === w || (w.length >= 5 && !/\d/.test(w) && distance(words[i + j], w, 1) <= 1));
      if (hit) { words = [...words.slice(0, i), canon, ...words.slice(i + pw.length)]; }
    }
  }
  return words.join(' ');
}
const synCache = new WeakMap();
function synonymList(synonyms = {}) {
  if (synCache.has(synonyms)) return synCache.get(synonyms);
  const list = [];
  for (const [canon, variants] of Object.entries(synonyms)) {
    const token = canon.replace(/\s+/g, '_');
    for (const v of [canon, ...variants]) list.push([normalize(v), token]);
  }
  list.sort((a, b) => b[0].length - a[0].length);
  synCache.set(synonyms, list);
  return list;
}

export function tokens(text, synonyms) {
  return applySynonyms(normalize(text), synonyms).split(' ').filter((t) => t && !isStop(t));
}

/** Edit distance where swapping two neighbours counts as one typo ("dispaly"), with an early exit past max. */
export function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

// how well one query word matches one knowledge-base word: 1 exact, less for a typo or a word stem
function wordScore(q, k) {
  if (q === k) return 1;
  if (/\d/.test(q) || /\d/.test(k)) return 0; // numbers and models must match exactly (5060 ≠ 5070)
  if (q.includes('_') || k.includes('_')) return 0; // synonym tokens ("walang_display") match only exactly
  if (q.length >= 5 && k.length >= 5 && (q.startsWith(k) || k.startsWith(q))) return 0.7;
  const max = q.length >= 8 ? 2 : q.length >= 5 ? 1 : 0;
  return max && distance(q, k, max) <= max ? 0.75 : 0;
}

// ---------- knowledge base ----------
/** Precompute each entry's words and how rare each word is (rare words decide the match). */
export function indexKb(kb) {
  const entries = kb.entries.map((e) => {
    const phrases = [e.q, ...(e.alt || [])].map((p) => applySynonyms(normalize(p), kb.synonyms));
    const words = new Set([...phrases.flatMap((p) => p.split(' ')), ...(e.keys || []).flatMap((k) => tokens(k, kb.synonyms))]);
    for (const w of [...words]) if (!w || isStop(w)) words.delete(w);
    return { entry: e, words: [...words], phrases: phrases.filter((p) => p.split(' ').length >= 2) };
  });
  const df = new Map();
  for (const x of entries) for (const w of x.words) df.set(w, (df.get(w) || 0) + 1);
  const n = entries.length;
  const idf = (w) => (df.has(w) ? Math.log((n + 1) / (df.get(w) + 0.5)) : 0);
  return { kb, entries, idf, vocab: [...df.keys()] };
}

/**
 * @returns {{best: object|null, score: number, alternatives: object[]}}
 *   best is set when we're confident; otherwise alternatives holds the closest entries ("Ito ba ang ibig mong sabihin?").
 */
export function match(index, text, { group } = {}) {
  const q = tokens(text, index.kb.synonyms);
  const qNorm = ` ${applySynonyms(normalize(text), index.kb.synonyms)} `;
  if (!q.length) return { best: null, score: 0, alternatives: [] };
  // each query word's weight: its rarity in the knowledge base (an unknown word still counts a little)
  const weights = q.map((t) => {
    let w = index.idf(t);
    if (!w) for (const v of index.vocab) if (wordScore(t, v) >= 0.7) w = Math.max(w, index.idf(v) * 0.9);
    // "paano", "bakit"… help pick between close answers but never carry a match on their own
    return (w || 1) * (SOFT.has(t) ? 0.3 : 1);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const scored = index.entries.map((x) => {
    let hit = 0;
    let used = 0;
    q.forEach((t, i) => {
      let s = 0;
      for (const w of x.words) { s = Math.max(s, wordScore(t, w)); if (s === 1) break; }
      hit += s * weights[i];
      if (s) used++;
    });
    let raw = hit / total;
    // a whole question phrase inside the text is a strong signal
    if (x.phrases.some((p) => qNorm.includes(` ${p} `))) raw += 0.25;
    if (group && x.entry.group === group) raw += 0.04;
    // tie-break: prefer the entry the question covers most closely (fewer unrelated words)
    raw += 0.1 * (used / Math.max(1, x.words.length));
    return { entry: x.entry, raw, score: Math.min(1, raw) };
  }).filter((s) => !s.entry.compute).sort((a, b) => b.raw - a.raw);
  const top = scored[0];
  const second = scored[1]?.raw ?? 0;
  // confident = a good score that also clearly beats the runner-up
  const best = top.score >= 0.55 && (top.raw - second >= 0.08 || top.score >= 0.8) ? top.entry : null;
  const alternatives = scored.filter((s) => s.score >= 0.3 && s.entry !== best && !s.entry.hidden).slice(0, 3).map((s) => s.entry);
  return { best, score: top.score, alternatives };
}

// ---------- parts named in a question ----------
const GPU_RE = /\b(rtx|rx|gtx|radeon|geforce)?\s*(\d{4})\s*(ti|xt|super)?\b/g;
const CPU_RE = /\b(ryzen\s*[3579]|r[3579]|core\s*i[3579]|i[3579]|core\s*ultra\s*[3579])?[\s-]*(\d{4,5})([a-z][a-z0-9]*)?\b/g;

const gpuKey = (p) => { const m = /(?:RTX|RX)\s+(\d{4})(?:\s+(Ti|XT))?/i.exec(p.name); return m ? { num: m[1], suf: (m[2] || '').toLowerCase() } : null; };
const cpuKey = (p) => { const m = /(?:Ryzen \d|i\d)[\s-]+(\d{4,5})([A-Z0-9]*)/i.exec(p.name); return m ? { num: m[1], suf: (m[2] || '').toLowerCase() } : null; };
// short, distinctive model words for cases, coolers and PSUs: "infinity m", "h7", "ak400", "a550bn"
export function modelAliases(p) {
  const brandless = p.name.replace(/\(.*?\)/g, '').replace(new RegExp(`^${p.brand}\\s+`, 'i'), '');
  const words = normalize(brandless).split(' ').filter((w) => !['mesh', 'white', 'digital', 'mag', 'pro', 'bronze', 'gold'].includes(w) || /\d/.test(w));
  const out = new Set();
  if (p.category === 'psu') { const m = /\b([a-z]*\s?\d{3,4}[a-z]*)\b/.exec(normalize(brandless)); if (m) out.add(m[1].replace(' ', '')); }
  if (p.stock) { out.add('stock cooler'); out.add('stock fan'); return [...out]; }
  if (!words.length) return [...out];
  out.add(/^[a-z]+$/.test(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0]);
  if (words.length > 2 && /\d/.test(words.at(-1)) === false) out.add(words.join(' ')); // full name, for "mini" vs "se"
  for (const w of words) if (/[a-z]\d|\d[a-z]/.test(w) && w.length >= 3 && !/^\d+(gb|tb|w|mm)$/.test(w)) out.add(w);
  return [...out];
}

/** Every catalog part the text names, grouped by category. Ambiguous numbers ("7600") match both CPU and GPU. */
export function detectParts(text, parts) {
  const norm = ` ${normalize(text)} `;
  const found = { cpu: [], motherboard: [], gpu: [], psu: [], case: [], cooler: [] };
  const add = (cat, p) => { if (p && !found[cat].includes(p)) found[cat].push(p); };
  const byCat = (c) => parts.filter((p) => p.category === c);

  for (const m of norm.matchAll(GPU_RE)) {
    const [, pre, num, suf = ''] = m;
    if (pre && /ryzen|core/.test(pre)) continue;
    const isCpuNum = byCat('cpu').some((p) => cpuKey(p)?.num === num);
    if (!pre && isCpuNum) continue; // bare "7600" is handled below as both
    const hits = byCat('gpu').filter((p) => { const k = gpuKey(p); return k && k.num === num && k.suf === suf; });
    const vram = /\b(\d{1,2})gb\b/.exec(norm.slice(m.index, m.index + 40))?.[1];
    const pick = vram && hits.some((p) => String(p.vramGB) === vram) ? hits.filter((p) => String(p.vramGB) === vram) : hits;
    pick.forEach((p) => add('gpu', p));
  }
  for (const m of norm.matchAll(CPU_RE)) {
    const [, pre, num, suf = ''] = m;
    const before = norm.slice(Math.max(0, m.index - 8), m.index + 1);
    if (/\b(rtx|rx|gtx|radeon|geforce)\s*$/.test(before)) continue;
    const hits = byCat('cpu').filter((p) => { const k = cpuKey(p); return k && k.num === num && k.suf === suf; });
    hits.forEach((p) => add('cpu', p));
    if (!pre && !hits.length) continue;
    // a bare number that is also a GPU ("7600" = Ryzen 5 7600 or RX 7600)
    if (!pre && /\b(rtx|rx)\b/.test(norm) === false) {
      byCat('gpu').filter((p) => { const k = gpuKey(p); return k && k.num === num && !k.suf && !suf; }).forEach((p) => add('gpu', p));
    }
  }
  // motherboards: by chipset ("b650m", "b760") or a full model word
  for (const m of norm.matchAll(/\b([abhxz]\d{3})(m|e|i)?\b/g)) {
    byCat('motherboard').filter((p) => p.chipset.toLowerCase() === m[1]).forEach((p) => add('motherboard', p));
  }
  for (const c of ['case', 'cooler', 'psu']) {
    for (const p of byCat(c)) if (modelAliases(p).some((a) => norm.includes(` ${a} `))) add(c, p);
  }
  // two coolers share an alias ("peerless assassin"): keep the one whose extra word is in the text
  if (found.cooler.length > 1) {
    const exact = found.cooler.filter((p) => modelAliases(p).some((a) => a.split(' ').length > 2 && norm.includes(` ${a} `)));
    if (exact.length) found.cooler = exact;
  }
  const watts = [...norm.matchAll(/\b(\d{3,4})\s?(?:w|watts?)\b/g)].map((m) => Number(m[1])).filter((w) => w >= 200 && w <= 2000);
  // same model, several cards ("RX 9070 XT" = Gaming OC or Challenger): a variant word in the text picks one
  for (const c of ['gpu', 'cpu']) {
    if (found[c].length < 2) continue;
    const named = found[c].filter((p) => normalize(p.name).split(' ').some((w) => w.length >= 4 && /^[a-z]+$/.test(w) && !GENERIC.has(w) && norm.includes(` ${w} `)));
    if (named.length) found[c] = named;
  }
  return { ...found, watts: watts.length ? watts : found.psu.map((p) => p.watts) };
}
const GENERIC = new Set(['geforce', 'radeon', 'ryzen', 'core', 'intel', 'tray', 'cooler', 'with']);

// ---------- computed answers ----------
const peso = (n) => `₱${Number(n).toLocaleString('en-PH')}`;
const has = (norm, words) => words.some((w) => norm.includes(` ${w} `));
const shortName = (p) => p.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();

/**
 * Answer from the catalog when the text names parts and asks something we can check.
 * @returns {{text: string, links: object[], id: string}|null}
 */
export function computeAnswer(text, parts) {
  const d = detectParts(text, parts);
  const norm = ` ${normalize(text)} `;
  const { cpu, motherboard: mb, gpu, case: cases, cooler } = d;
  const any = cpu.length + mb.length + gpu.length + cases.length + cooler.length + d.psu.length;
  if (!any && !d.watts.length) return null;
  const asksPrice = has(norm, ['magkano', 'presyo', 'price', 'halaga', 'mura', 'pinakamura']);
  const asksRam = has(norm, ['ram', 'memory', 'ddr4', 'ddr5', 'ddr']);
  const asksBoard = has(norm, ['motherboard', 'mobo', 'board', 'socket', 'chipset']);
  const asksPair = has(norm, ['bagay', 'pair', 'partner', 'match', 'swak', 'ipares', 'kapares']);
  const asksIgpu = has(norm, ['igpu', 'built', 'integrated', 'graphics', 'display', 'onboard']) && !gpu.length;
  const out = (id, lines, links) => ({ id, text: lines.filter(Boolean).join('\n\n'), links });

  // "anong GPU ang bagay sa Ryzen 5 5600?": the May Parts page does exactly this
  if (asksPair && (cpu.length + gpu.length + mb.length) === 1) {
    const p = cpu[0] || gpu[0] || mb[0];
    return out('calc-pair', [`Para makita kung anong parts ang bagay sa ${shortName(p)}, gamitin ang May Parts na Ako: piliin ang ${shortName(p)} at ipapakita namin ang compatible at balanseng motherboard, RAM, GPU at PSU, may presyo.`], [{ page: 'may/', label: 'May Parts na Ako' }]);
  }
  // GPU + PSU watts: compare with the GPU maker's recommended PSU
  if (gpu.length && d.watts.length) {
    const w = Math.max(...d.watts);
    const lines = gpu.map((g) => {
      const v = w >= g.recPsuW ? `Oo, kaya. ${g.recPsuW}W ang recommended PSU ng ${shortName(g)}, at ${w}W ang sa iyo.`
        : w >= g.recPsuW - 50 ? `Pwede, pero manipis. ${g.recPsuW}W ang recommended ng ${shortName(g)}, ${w}W lang ang sa iyo. Okay lang kung 65W na CPU at kilalang brand ang PSU, pero mas safe ang ${g.recPsuW}W pataas.`
          : `Kulang. ${g.recPsuW}W ang recommended PSU ng ${shortName(g)}, ${w}W lang ang sa iyo.`;
      return v;
    });
    return out('calc-gpu-psu', [...new Set(lines), 'Galing ang recommended wattage sa specs ng card. Para sa buong set (CPU + GPU), gamitin ang Mag-Build para makita ang estimated load. Mahalaga rin ang quality: mas maganda ang kilalang brand na may 80+ rating kaysa sa walang brand na mataas ang nakasulat na watts.'], [{ cat: 'psu' }, { page: 'build/', label: 'Kuwentahin sa Mag-Build' }]);
  }
  // GPU + case: card length
  if (gpu.length && cases.length) {
    const lines = [];
    for (const g of gpu) for (const c of cases) {
      lines.push(g.lengthMm <= c.maxGpuMm
        ? `Kasya. ${g.lengthMm}mm ang ${shortName(g)}, at hanggang ${c.maxGpuMm}mm ang kaya ng ${shortName(c)}.`
        : `Hindi kasya. ${g.lengthMm}mm ang ${shortName(g)}, pero ${c.maxGpuMm}mm lang ang kaya ng ${shortName(c)}.`);
    }
    return out('calc-gpu-case', [...lines, 'Batay ito sa published specs. Kung may front radiator o fans ka, mababawasan pa ang space, kaya i-check ang manual ng case.'], [{ cat: 'case' }, { cat: 'gpu' }]);
  }
  // cooler + case: tower height or 240mm radiator
  if (cooler.length && cases.length) {
    const lines = [];
    for (const k of cooler) for (const c of cases) {
      if (k.stock) lines.push(`Kasya ang stock cooler sa ${shortName(c)}. Mababa lang ang stock coolers.`);
      else if (k.type === 'aio') lines.push(c.rad240 ? `Kasya. May 240mm radiator mount ang ${shortName(c)} para sa ${shortName(k)}.` : `Hindi kasya. Walang 240mm radiator mount ang ${shortName(c)}.`);
      else lines.push(k.heightMm <= c.maxCoolerMm ? `Kasya. ${k.heightMm}mm ang taas ng ${shortName(k)}, at hanggang ${c.maxCoolerMm}mm ang kaya ng ${shortName(c)}.` : `Hindi kasya. ${k.heightMm}mm ang ${shortName(k)}, ${c.maxCoolerMm}mm lang ang kaya ng ${shortName(c)}.`);
    }
    return out('calc-cooler-case', lines, [{ cat: 'cooler' }, { cat: 'case' }]);
  }
  // cooler + CPU: socket and heat
  if (cooler.length && cpu.length) {
    const lines = [];
    for (const k of cooler) for (const c of cpu) {
      if (k.stock) lines.push(c.boxedCooler ? `May kasamang cooler ang ${shortName(c)}, at sapat iyon para sa ${c.tdp}W na CPU na ito.` : `Walang kasamang cooler ang ${shortName(c)}. Kailangan mong bumili ng hiwalay.`);
      else if (!k.sockets.includes(c.socket)) lines.push(`Hindi supported ng ${shortName(k)} ang ${c.socket}.`);
      else lines.push(`Oo. Supported ng ${shortName(k)} ang ${c.socket}, at kaya nito ang ${c.tdp}W ng ${shortName(c)} (rated ${k.tdpRating}W).`);
    }
    return out('calc-cooler-cpu', lines, [{ cat: 'cooler' }]);
  }
  // CPU + motherboard: socket and RAM
  if (cpu.length && mb.length) {
    const lines = [];
    for (const c of cpu) {
      const fit = mb.filter((b) => b.socket === c.socket);
      const chip = [...new Set(mb.map((b) => b.chipset))].join('/');
      if (!fit.length) lines.push(`Hindi kasya. ${c.socket} ang ${shortName(c)}, pero ${[...new Set(mb.map((b) => b.socket))].join('/')} ang ${chip}.`);
      else {
        const mem = [...new Set(fit.map((b) => b.memType))];
        lines.push(`Kasya. Parehong ${c.socket} ang ${shortName(c)} at ang ${chip}. RAM: ${mem.join(' o ')}${mem.length > 1 ? ' (depende sa model ng board, nakasulat sa pangalan)' : ''}.`);
        if (c.socket === 'AM4') lines.push('Sa AM4 board, pwedeng kailangan ng BIOS update para sa mas bagong Ryzen. I-check ang CPU support list ng board.');
      }
    }
    return out('calc-cpu-board', lines, [{ cat: 'motherboard' }]);
  }
  // motherboard → RAM type
  if (mb.length && (asksRam || !cpu.length) && !asksPrice) {
    const chips = [...new Set(mb.map((b) => b.chipset))];
    const lines = chips.map((ch) => {
      const boards = mb.filter((b) => b.chipset === ch);
      const mem = [...new Set(boards.map((b) => b.memType))];
      const socket = boards[0].socket;
      if (mem.length === 1) return `${ch} (${socket}): ${mem[0]} ang RAM. ${socket === 'AM5' ? 'DDR5 lang talaga ang AM5.' : ''}`;
      return `${ch} (${socket}): depende sa model. ${boards.map((b) => `${shortName(b)} = ${b.memType}`).join('; ')}. Tingnan kung may "DDR4" o "DDR5" sa pangalan ng board.`;
    });
    return out('calc-board-ram', [...lines, 'Hindi pwedeng ipagpalit ang DDR4 at DDR5: iba ang hugis ng slot.'], [{ cat: 'ram' }, { cat: 'motherboard' }]);
  }
  if (cpu.length && !asksPrice) {
    const lines = [];
    for (const c of cpu) {
      if (asksIgpu) {
        lines.push(c.igpu ? `Oo, may built-in graphics ang ${shortName(c)}, kaya may display kahit walang graphics card.${c.igpu < 10 ? ' Basic lang ito: pang-desktop at video, hindi pang-gaming.' : ' Isa ito sa mas malakas na built-in graphics, kaya ang light games sa mababang settings.'}` : `Wala. Walang built-in graphics ang ${shortName(c)}, kaya kailangan ng graphics card para may display.`);
      } else if (asksRam && !asksBoard) {
        lines.push(`${shortName(c)} (${c.socket}): ${c.memTypes.join(' o ')}.${c.memTypes.length > 1 ? ' Ang board ang magdedesisyon: may DDR4 board at may DDR5 board, hindi pwedeng pareho.' : ''}`);
      } else {
        const boards = parts.filter((p) => p.category === 'motherboard' && p.socket === c.socket);
        const chips = [...new Set(boards.map((b) => b.chipset))];
        lines.push(`${shortName(c)}: ${c.socket} socket, ${c.cores}, ${c.tdp}W, ${c.memTypes.join('/')}. ${c.igpu ? 'May built-in graphics.' : 'Walang built-in graphics, kailangan ng GPU.'} ${c.boxedCooler ? 'May kasamang cooler.' : 'Walang kasamang cooler.'}`);
        if (chips.length) lines.push(`Swak na boards sa listahan namin: ${chips.join(', ')}.`);
      }
    }
    const next = asksIgpu ? (cpu.some((c) => !c.igpu) ? 'gpu' : 'cpu') : asksRam ? 'ram' : 'motherboard';
    return out('calc-cpu', lines, [...new Set([next, 'cpu'])].map((cat) => ({ cat })));
  }
  if (gpu.length && !asksPrice) {
    const lines = gpu.map((g) => `${shortName(g)}: ${g.vramGB}GB VRAM, ${g.lengthMm}mm ang haba, ${g.recPsuW}W ang recommended PSU.`);
    return out('calc-gpu', lines, [{ cat: 'gpu' }, { cat: 'psu' }]);
  }
  const named = [...cpu, ...mb, ...gpu, ...cases, ...cooler, ...d.psu];
  if (named.length) {
    const list = named.slice(0, 4).map((p) => `${shortName(p)}: ${peso(p.price)}`);
    return out('calc-price', [...list, 'Presyo ito ng Shopee Mall listing noong huling check namin, at pwedeng magbago. I-check sa Shopee bago bumili.'], [...new Set(named.map((p) => p.category))].map((cat) => ({ cat })));
  }
  return null;
}

// ---------- saving unanswered questions ----------
/** Strip what could identify someone before a question is saved: emails, PH mobile numbers, long digit runs, links. */
export function redact(text) {
  return String(text ?? '')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[link]')
    .replace(/(?:\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g, '[number]')
    .replace(/\d{8,}/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
