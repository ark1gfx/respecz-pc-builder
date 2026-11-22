import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATEGORIES, checkBuild, hasFail, totalPrice } from '../js/compat.js';
import { suggestBuild, USE_CASES, gpuVendor, availablePrefs } from '../js/picker.js';

const { parts } = JSON.parse(fs.readFileSync(new URL('../data/parts.json', import.meta.url)));
const { builds } = JSON.parse(fs.readFileSync(new URL('../data/builds.json', import.meta.url)));
const byId = new Map(parts.map((p) => [p.id, p]));

test('part ids are unique and categories are known', () => {
  assert.equal(byId.size, parts.length);
  for (const p of parts) assert.ok(CATEGORIES.includes(p.category), p.id);
});

test('every buyable part has a Shopee affiliate short link', () => {
  for (const p of parts) if (!p.stock) assert.match(p.shopeeUrl, /^https:\/\/s\.shopee\.ph\/\w+$/, p.id);
});

test('sample builds reference real parts and pass every hard check', () => {
  for (const b of builds) {
    const build = Object.fromEntries(CATEGORIES.map((c) => [c, b.parts[c] ? byId.get(b.parts[c]) : null]));
    for (const c of CATEGORIES) if (b.parts[c]) assert.ok(build[c], `${b.id}: unknown ${b.parts[c]}`);
    const results = checkBuild(build);
    assert.ok(!hasFail(results), `${b.id}: ${JSON.stringify(results.filter((r) => r.level === 'fail'))}`);
  }
});

test('socket mismatch fails', () => {
  const r = checkBuild({ cpu: byId.get('cpu-r5-7600'), motherboard: byId.get('mb-prime-a520m-k') });
  assert.ok(r.some((x) => x.key === 'socket' && x.level === 'fail'));
});

test('DDR5 RAM on a DDR4 board fails', () => {
  const r = checkBuild({ motherboard: byId.get('mb-h610m-e'), ram: byId.get('ram-d5-16-fury') });
  assert.ok(r.some((x) => x.key === 'ram-type' && x.level === 'fail'));
});

test('no GPU with an F CPU fails (no display)', () => {
  const r = checkBuild({ cpu: byId.get('cpu-r5-5600'), gpu: null });
  assert.ok(r.some((x) => x.key === 'display' && x.level === 'fail'));
});

test('ATX board in an mATX case fails', () => {
  const r = checkBuild({ motherboard: byId.get('mb-b550-a-pro'), case: byId.get('case-db330m') });
  assert.ok(r.some((x) => x.key === 'form-factor' && x.level === 'fail'));
});

test('small PSU with a big GPU fails', () => {
  const r = checkBuild({ cpu: byId.get('cpu-i7-14700'), gpu: byId.get('gpu-rtx5070'), psu: byId.get('psu-a550bn') });
  assert.ok(r.some((x) => x.key === 'psu' && x.level === 'fail'));
});

test('stock cooler on a CPU without one fails', () => {
  const r = checkBuild({ cpu: byId.get('cpu-r7-7800x3d'), cooler: byId.get('cooler-stock') });
  assert.ok(r.some((x) => x.key === 'cooler' && x.level === 'fail'));
});

test('suggestions stay in budget, are complete and have no compat problems', () => {
  for (const useCase of Object.keys(USE_CASES)) {
    for (let budget = 35000; budget <= 250000; budget += 5000) {
      const r = suggestBuild(parts, budget, useCase);
      if (r.error) {
        assert.ok(r.minBudget > budget, `${useCase} ${budget}: error but minBudget ${r.minBudget}`);
        continue;
      }
      assert.ok(r.total <= budget, `${useCase} ${budget}: total ${r.total}`);
      assert.equal(r.total, totalPrice(r.build));
      const bad = checkBuild(r.build).filter((x) => x.level !== 'ok');
      assert.deepEqual(bad, [], `${useCase} ${budget}`);
    }
  }
});

test('mid budgets get a real GPU for gaming', () => {
  const r = suggestBuild(parts, 60000, "gaming");
  assert.ok(r.build.gpu, 'expected a GPU at ₱60K gaming');
});

test('brand and size preferences are respected', () => {
  const cases = [
    [{ cpuBrand: 'AMD' }, (b) => b.cpu.brand === 'AMD'],
    [{ cpuBrand: 'Intel' }, (b) => b.cpu.brand === 'Intel'],
    [{ gpuBrand: 'NVIDIA' }, (b) => b.gpu && gpuVendor(b.gpu) === 'NVIDIA'],
    [{ gpuBrand: 'AMD' }, (b) => b.gpu && gpuVendor(b.gpu) === 'AMD'],
    [{ formFactor: 'ATX' }, (b) => b.motherboard.formFactor === 'ATX'],
    [{ formFactor: 'mATX', cpuBrand: 'Intel', gpuBrand: 'AMD' }, (b) => b.motherboard.formFactor === 'mATX' && b.cpu.brand === 'Intel' && gpuVendor(b.gpu) === 'AMD'],
  ];
  for (const [prefs, ok] of cases) {
    for (const budget of [90000, 160000]) {
      const r = suggestBuild(parts, budget, 'gaming', prefs);
      assert.ok(!r.error, `${JSON.stringify(prefs)} @ ${budget}: ${r.error}`);
      assert.ok(ok(r.build), `${JSON.stringify(prefs)} @ ${budget}`);
      assert.ok(!checkBuild(r.build).some((x) => x.level === 'fail'), `${JSON.stringify(prefs)} compatible`);
    }
  }
});

test('impossible preference mixes say so instead of asking for more budget', () => {
  // School caps the GPU at a light card; every Radeon in the list is above that
  const r = suggestBuild(parts, 250000, 'school', { gpuBrand: 'AMD' });
  assert.equal(r.noMatch, true);
});

test('every size and brand choice is in the catalog, and Mini-ITX works for both CPU brands', () => {
  const a = availablePrefs(parts);
  for (const key of Object.keys(a)) for (const [v, ok] of Object.entries(a[key])) assert.ok(ok, `${key}=${v}`);
  for (const cpuBrand of ['AMD', 'Intel']) {
    const r = suggestBuild(parts, 90000, 'gaming', { formFactor: 'ITX', cpuBrand });
    assert.ok(!r.error, `${cpuBrand} ITX: ${r.error}`);
    assert.equal(r.build.motherboard.formFactor, 'ITX');
    assert.ok(r.build.case.formFactors.includes('ITX'));
  }
  const atx = suggestBuild(parts, 90000, 'gaming', { formFactor: 'ATX', cpuBrand: 'Intel' });
  assert.ok(!atx.error && atx.build.motherboard.formFactor === 'ATX');
});
