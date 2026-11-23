import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../tools/visitor-counter/worker.js';
import { shouldHit } from '../js/visitors.js';

function kv() { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
const req = (path, method, { origin = 'https://respecz.com', ua = 'Mozilla/5.0', key } = {}) =>
  new Request('https://w.example' + path, { method, headers: { Origin: origin, 'User-Agent': ua, ...(key ? { 'X-Visits-Key': key } : {}) } });
const count = async (env) => (await (await worker.fetch(req('/count', 'GET', { key: 'k1' }), env)).json()).unique;

test('hits from the site are counted; the hit never reveals the number', async () => {
  const env = { VISITS: kv(), VISITS_KEY: 'k1' };
  const r = await (await worker.fetch(req('/hit', 'POST'), env)).json();
  assert.deepEqual(r, { ok: true });
  await worker.fetch(req('/hit', 'POST'), env);
  assert.equal(await count(env), 2);
});

test('the count is private (needs the Studio key)', async () => {
  const env = { VISITS: kv(), VISITS_KEY: 'k1' };
  assert.equal((await worker.fetch(req('/count', 'GET'), env)).status, 401);
  assert.equal((await worker.fetch(req('/count', 'GET', { key: 'wrong' }), env)).status, 401);
  assert.equal((await worker.fetch(req('/count', 'GET', { key: 'k1' }), { VISITS: kv() })).status, 401);
});

test('hits from other sites or bots are not counted', async () => {
  const env = { VISITS: kv(), VISITS_KEY: 'k1' };
  await worker.fetch(req('/hit', 'POST', { origin: 'https://evil.example' }), env);
  await worker.fetch(req('/hit', 'POST', { ua: 'facebookexternalhit/1.1' }), env);
  assert.equal(await count(env), 0);
});

test('a device is counted once', () => {
  const store = new Map();
  const s = { getItem: (k) => store.get(k) ?? null };
  assert.equal(shouldHit(s), true);
  store.set('rz-counted-v1', '1');
  assert.equal(shouldHit(s), false);
});
