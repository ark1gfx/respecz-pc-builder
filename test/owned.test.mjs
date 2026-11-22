import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkBuild } from '../js/compat.js';
import { OWNED_PARTS, suggestForOwned, encodeOwned, decodeOwned } from '../js/owned.js';

const { parts } = JSON.parse(fs.readFileSync(new URL('../data/parts.json', import.meta.url)));
const byId = new Map(parts.map((p) => [p.id, p]));
const own = (...ids) => decodeOwned(ids.join(','), byId);
const need = (res, cat) => res.needs.find((n) => n.cat === cat);

test('owned ids are unique and never clash with catalog ids', () => {
  const ids = OWNED_PARTS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(!byId.has(id), id);
});

test('DDR4 RAM only: every suggested board is DDR4, across AM4 and Intel', () => {
  const res = suggestForOwned(own('o-ram-d4x2'), parts);
  const boards = need(res, 'motherboard');
  assert.ok(boards.total > 0);
  assert.ok(boards.picks.every((b) => b.memType === 'DDR4'));
  assert.deepEqual(new Set(boards.picks.map((b) => b.socket)), new Set(['AM4', 'LGA1700']));
  assert.ok(need(res, 'cpu').picks.every((c) => c.memTypes.includes('DDR4')));
  assert.ok(need(res, 'cpu').picks.some((c) => c.socket === 'AM4'), 'CPUs without graphics still count');
});

test('DDR5 RAM only: no DDR4 boards or AM4 CPUs', () => {
  const res = suggestForOwned(own('o-ram-d5x2'), parts);
  assert.ok(need(res, 'motherboard').picks.every((b) => b.memType === 'DDR5'));
  assert.ok(need(res, 'cpu').picks.every((c) => c.socket !== 'AM4'));
});

test('5600G + 1050 Ti: AM4 DDR4 boards, DDR4 RAM, PSU covers the load', () => {
  const owned = own('o-cpu-5600g', 'o-gpu-1050ti');
  const res = suggestForOwned(owned, parts);
  assert.ok(need(res, 'motherboard').picks.length > 0);
  assert.ok(need(res, 'motherboard').picks.every((b) => b.socket === 'AM4' && b.memType === 'DDR4'));
  assert.ok(need(res, 'ram').picks.every((r) => r.memType === 'DDR4'));
  assert.equal(need(res, 'cpu'), undefined);
  assert.ok(!res.notes.some((n) => n.level === 'fail'));
});

test('LGA1200 CPU says the socket is not in our list instead of showing nothing', () => {
  const res = suggestForOwned(own('o-cpu-10400f'), parts);
  assert.equal(need(res, 'motherboard').total, 0);
  assert.match(need(res, 'motherboard').empty, /LGA1200/);
});

test('owned parts that do not fit each other are flagged', () => {
  const res = suggestForOwned(own('o-cpu-5600g', 'o-ram-d5x2'), parts);
  assert.ok(res.notes.some((n) => n.level === 'fail' && n.key === 'cpu-ram'));
  assert.ok(checkBuild(own('o-mb-am4', 'o-ram-d5x2')).some((r) => r.key === 'ram-type' && r.level === 'fail'));
});

test('share link round-trips and ignores junk', () => {
  const owned = own('o-ram-d4x2', 'cpu-r5-5600');
  const v = encodeOwned(owned);
  assert.equal(v, 'cpu-r5-5600,o-ram-d4x2');
  assert.deepEqual(Object.keys(decodeOwned(`${v},nope,<x>`, byId)).sort(), ['cpu', 'ram']);
});
