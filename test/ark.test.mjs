import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATEGORIES } from '../js/compat.js';
import { walk, decodePath } from '../js/troubleshoot-core.js';
import { indexKb, match, computeAnswer, detectParts, normalize, distance, modelAliases } from '../js/ark-core.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const kb = read('../data/ark.json');
const ts = read('../data/troubleshoot.json');
const { parts } = read('../data/parts.json');
const index = indexKb(kb);
const ids = new Set(kb.entries.map((e) => e.id));
const bestId = (q) => match(index, q).best?.id ?? null;

test('knowledge base: unique ids, known groups, valid links and follow-ups', () => {
  assert.equal(ids.size, kb.entries.length, 'duplicate entry id');
  const groups = new Set(kb.groups.map((g) => g.id));
  for (const g of kb.groups) assert.ok(g.id === 'pc' || g.id === 'buy' || CATEGORIES.includes(g.id), `group ${g.id}`);
  for (const e of kb.entries) {
    assert.ok(groups.has(e.group), `${e.id}: unknown group ${e.group}`);
    assert.ok(e.q, `${e.id}: no question`);
    if (e.compute) continue;
    assert.ok(e.a && e.a.length > 20, `${e.id}: no answer`);
    for (const n of e.next || []) assert.ok(ids.has(n), `${e.id}: follow-up "${n}" doesn't exist`);
    for (const l of e.links || []) {
      if (l.cat) assert.ok(CATEGORIES.includes(l.cat), `${e.id}: unknown category ${l.cat}`);
      if (l.ts) {
        const p = decodePath(l.ts);
        const at = walk(ts, p.symptom, p.answers);
        assert.ok(at?.node && at.trail.length === p.answers.length, `${e.id}: troubleshooter path "${l.ts}" is broken`);
      }
      if (l.page) assert.ok(fs.existsSync(new URL(`../${l.page}index.html`, import.meta.url)), `${e.id}: page ${l.page} missing`);
    }
  }
  // every part in the picker has prepared questions
  for (const g of kb.groups) assert.ok(kb.entries.filter((e) => e.group === g.id && !e.hidden).length >= 5, `${g.id}: fewer than 5 questions`);
});

test('every prepared "compute" question is answered from the catalog', () => {
  for (const e of kb.entries.filter((x) => x.compute)) {
    const a = computeAnswer(e.q, parts);
    assert.ok(a, `${e.id}: "${e.q}" got no computed answer`);
    assert.ok(!a.id.startsWith('calc-price'), `${e.id}: fell through to a price answer`);
  }
});

test('Taglish questions, synonyms and typos find the right answer', () => {
  const cases = {
    'black screen pc ko': 'pc-nodisplay',
    'walang dispaly': 'pc-nodisplay',
    'ayaw lumabas ng display': 'pc-nodisplay',
    'ayaw bumukas ng pc': 'pc-nopower',
    'nag rerestart pc ko': 'pc-restart',
    'mababa fps sa valorant': 'pc-slow',
    'naglalag pc ko pag naglalaro': 'pc-stutter',
    'ilang watts ng psu kailangan': 'psu-watts',
    '16gb o 32gb': 'ram-how-much',
    'pwede ba ddr5 sa ddr4 board': 'ram-ddr4-ddr5',
    'pano mag on xmp sa msi': 'ram-xmp',
    'nvme o sata': 'ssd-nvme-sata',
    'termal paste paano': 'cooler-paste',
    'bronze o gold psu': 'psu-rating',
    'paanu mag instal ng windows': 'pc-windows-install',
    'kasya ba gpu ko sa case': 'case-gpu-fit',
    'may problema pc ko': 'pc-problem',
    'bottlenek': 'pc-bottleneck',
    'sino ka': 'ark-who',
    'salamat po': 'ark-thanks',
  };
  for (const [q, id] of Object.entries(cases)) assert.equal(bestId(q), id, `"${q}"`);
});

test('nonsense and off-topic questions get no confident answer', () => {
  for (const q of ['asdf qwerty', 'paano mag luto ng adobo', '']) {
    const r = match(index, q);
    assert.equal(r.best, null, q);
    assert.equal(r.alternatives.length, 0, q);
  }
});

test('computed answers use the catalog numbers', () => {
  const g = parts.find((p) => p.id === 'gpu-rtx5060');
  const ok = computeAnswer('kaya ba ng 550w ang rtx 5060?', parts);
  assert.equal(ok.id, 'calc-gpu-psu');
  assert.match(ok.text, new RegExp(`${g.recPsuW}W`));
  assert.match(computeAnswer('kaya ba ng 450w ang rtx 5070', parts).text, /^Kulang/);
  assert.match(computeAnswer('anong ram sa b650m', parts).text, /DDR5/);
  assert.match(computeAnswer('anong ram sa b760m', parts).text, /depende sa model/);
  assert.match(computeAnswer('pwede ba ryzen 5 5600 sa b650m', parts).text, /^Hindi kasya/);
  assert.match(computeAnswer('may igpu ba ang ryzen 5 5600', parts).text, /^Wala/);
  assert.match(computeAnswer('may built in graphics ba i5-12400', parts).text, /^Oo/);
  assert.equal(computeAnswer('paano mag lagay ng thermal paste', parts), null);
});

test('part detection: every catalog model is found by its own name, and numbers stay exact', () => {
  for (const p of parts.filter((x) => ['cpu', 'gpu', 'case', 'cooler', 'psu'].includes(x.category) && !x.stock)) {
    assert.ok(detectParts(p.name, parts)[p.category].includes(p), `${p.id} not detected from "${p.name}" (aliases: ${modelAliases(p)})`);
  }
  const d = detectParts('rtx 5060 ti 16gb', parts);
  assert.deepEqual(d.gpu.map((p) => p.id), ['gpu-rtx5060ti-16']);
  assert.ok(!detectParts('rtx 5060', parts).gpu.some((p) => p.id.includes('ti')));
  assert.deepEqual(detectParts('rx 7600', parts).cpu, []);
});

test('text helpers', () => {
  assert.equal(normalize('  Kaya ba ng 550 W?? '), 'kaya ba ng 550w');
  assert.equal(distance('dispaly', 'display', 1), 1);
  assert.equal(distance('ssd', 'hdd', 1), 2);
});

test('Ark copy: PC games only, and never claims to be an AI', () => {
  const text = JSON.stringify(kb).toLowerCase();
  assert.ok(!text.includes('mobile legends') && !text.includes('mlbb'));
  const who = kb.entries.find((e) => e.id === 'ark-who').a.toLowerCase();
  assert.ok(!/\bai\b|artificial/.test(who));
});

test('a variant word picks one card when two share a model number', () => {
  assert.deepEqual(detectParts('rx 9070 xt challenger', parts).gpu.map((p) => p.id), ['gpu-rx9070xt-ch']);
  assert.equal(detectParts('rx 9070 xt', parts).gpu.length, 2);
});

test('redact strips what could identify someone before a question is saved', async () => {
  const { redact } = await import('../js/ark-core.js');
  assert.equal(redact('email ko juan.dc@gmail.com pls'), 'email ko [email] pls');
  assert.equal(redact('text me 0917 123 4567'), 'text me [number]');
  assert.equal(redact('+639171234567 ito number ko'), '[number] ito number ko');
  assert.equal(redact('tingnan https://example.com/x'), 'tingnan [link]');
  // part numbers and watts stay readable
  assert.equal(redact('kaya ba ng 550w ang rtx 5060 at 7600'), 'kaya ba ng 550w ang rtx 5060 at 7600');
  assert.equal(redact('x'.repeat(300)).length, 200);
});

test('contact links are real, and LOG_URL is empty (nothing sent) or a Google Apps Script web app', async () => {
  const c = await import('../js/contact.js');
  assert.ok(c.LOG_URL === '' || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c.LOG_URL), c.LOG_URL);
  assert.match(c.PM_URL, /^https:\/\/m\.me\//);
  assert.match(c.PAGE_URL, /^https:\/\/www\.facebook\.com\//);
  assert.ok(c.GROUP_URL === '' || /^https:\/\/(www\.)?facebook\.com\/groups\//.test(c.GROUP_URL));
});
