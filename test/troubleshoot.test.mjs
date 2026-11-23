import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATEGORIES } from '../js/compat.js';
import { validate, walk, isResult, encodePath, decodePath } from '../js/troubleshoot-core.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/troubleshoot.json', import.meta.url)));
const page = fs.readFileSync(new URL('../troubleshoot/index.html', import.meta.url), 'utf8');

// every answer path from every symptom, to the result it ends on
function allPaths() {
  const out = [];
  const go = (symptom, answers) => {
    const at = walk(data, symptom, answers);
    if (isResult(at.node)) { out.push({ symptom, answers, at }); return; }
    at.node.options.forEach((_, i) => go(symptom, [...answers, i]));
  };
  for (const s of data.symptoms) go(s.id, []);
  return out;
}

test('the troubleshooter tree has no dead ends, loops, orphan nodes or unknown categories', () => {
  assert.deepEqual(validate(data, CATEGORIES), []);
});

test('every answer path ends on a result within 8 Oo/Hindi questions', () => {
  const paths = allPaths();
  assert.ok(paths.length >= 30, `only ${paths.length} paths`);
  for (const { symptom, answers, at } of paths) {
    assert.ok(answers.length <= 8, `${encodePath(symptom, answers)} asks too many questions`);
    assert.ok(at.node.steps.length >= 2);
  }
});

test('validate catches a broken tree', () => {
  const bad = {
    symptoms: [{ id: 'x', label: 'X', start: 'a' }],
    nodes: {
      a: { q: 'A?', options: [{ label: 'yes', next: 'missing' }, { label: 'loop', next: 'b' }] },
      b: { q: 'B?', options: [{ label: 'back', next: 'a' }, { label: 'done', next: 'r' }] },
      r: { title: 'R', why: 'w', steps: ['one'], cats: ['gpu', 'toaster'], open: false },
      lonely: { title: 'L', why: 'w', steps: ['1', '2'], cats: [], open: false },
    },
  };
  const errors = validate(bad, CATEGORIES).join('\n');
  assert.match(errors, /missing node "missing"/);
  assert.match(errors, /loop: a → b → a/);
  assert.match(errors, /r: a result needs at least 2 steps/);
  assert.match(errors, /unknown category "toaster"/);
  assert.match(errors, /lonely: no question leads here/);
});

test('walk follows answers and stops cleanly on a bad index', () => {
  // Display: fans on (Oo) → has a GPU (Oo) → monitor not on the GPU (Hindi)
  const at = walk(data, 'display', [0, 0, 1]);
  assert.equal(at.id, 'r-plug-into-gpu');
  assert.equal(at.trail.length, 3);
  const bad = walk(data, 'display', [0, 99, 0]);
  assert.equal(bad.id, 'd2'); // the valid part is kept, the rest ignored
  assert.equal(walk(data, 'nope', []), null);
});

test('the URL path round-trips and ignores junk', () => {
  assert.equal(encodePath('slow', [0, 1]), 'slow.0.1');
  assert.deepEqual(decodePath('slow.0.1'), { symptom: 'slow', answers: [0, 1] });
  assert.deepEqual(decodePath('slow.0.x.1'), { symptom: 'slow', answers: [0] });
  assert.equal(decodePath(''), null);
});

test('safety: every result that opens the case says so, and the page always shows the PSU warning', () => {
  const opensCase = /bunutin|tanggalin|ibalik nang mabuti|buksan ang case|header/i;
  for (const [id, n] of Object.entries(data.nodes)) {
    if (!isResult(n)) continue;
    // a result whose steps involve the inside of the PC must be flagged, so the "before you open it" note shows
    if (n.steps.some((s) => /patayin at bunutin/i.test(s))) assert.equal(n.open, true, `${id} should have open: true`);
    if (n.open) assert.ok(n.steps.some((s) => opensCase.test(s)), `${id} is open: true but no step touches the inside`);
  }
  assert.match(page, /Huwag kailanman buksan ang PSU/);
  assert.match(fs.readFileSync(new URL('../js/troubleshoot.js', import.meta.url), 'utf8'), /Huwag buksan ang PSU/);
});

test('game examples are PC games only', () => {
  const text = JSON.stringify(data).toLowerCase();
  assert.ok(!text.includes('mobile legends') && !text.includes('mlbb'));
});

test('the start screen and every question offer a way to type your own question (it goes to Ark)', () => {
  const js = fs.readFileSync(new URL('../js/troubleshoot.js', import.meta.url), 'utf8');
  assert.match(js, /Wala sa listahan\?/);
  assert.match(js, /data-ark-type/);
  assert.match(js, /respecz:open-ark/);
});

test('flowchart: every question is a short Oo/Hindi, every fix starts with 1–3 short lines', () => {
  for (const [id, n] of Object.entries(data.nodes)) {
    if (isResult(n)) {
      assert.ok(Array.isArray(n.short) && n.short.length >= 1 && n.short.length <= 3, `${id}: short needs 1-3 lines`);
      for (const line of n.short) assert.ok(line.length <= 70, `${id}: "${line}" is too long for the card`);
    } else {
      assert.deepEqual(n.options.map((o) => o.label), ['Oo', 'Hindi'], `${id}: answers must be Oo / Hindi`);
      assert.ok(n.q.length <= 60, `${id}: question too long (${n.q.length})`);
    }
  }
  for (const s of data.symptoms) assert.ok(s.icon && s.label.length <= 10, `${s.id}: area needs an icon and a short label`);
});
