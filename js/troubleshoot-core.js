// Troubleshooter logic, no DOM: walk the symptom → question → result tree in data/troubleshoot.json,
// and check that the tree has no dead ends. Used by js/troubleshoot.js and test/troubleshoot.test.mjs.

/** A node is a question ({q, options}) or a result ({title, steps}). */
export const isResult = (node) => !!node && Array.isArray(node.steps);

/**
 * Follow a symptom and a list of picked option indexes.
 * Returns the current node, its id, and the trail of {id, node, picked} for the questions answered so far.
 * Stops early (keeping what is valid) when an answer index doesn't exist, so a bad link never crashes.
 */
export function walk(data, symptomId, answers = []) {
  const symptom = data.symptoms.find((s) => s.id === symptomId);
  if (!symptom) return null;
  let id = symptom.start;
  const trail = [];
  for (const a of answers) {
    const node = data.nodes[id];
    const opt = !isResult(node) && node?.options?.[a];
    if (!opt) break;
    trail.push({ id, node, picked: a });
    id = opt.next;
  }
  return { symptom, id, node: data.nodes[id], trail };
}

/** "nodisplay.1.0" ⇄ { symptom: 'nodisplay', answers: [1, 0] } (kept in the URL hash, so Back works). */
export function encodePath(symptomId, answers = []) {
  return [symptomId, ...answers].join('.');
}
export function decodePath(str) {
  const [symptom, ...rest] = String(str || '').split('.');
  const answers = [];
  for (const r of rest) {
    if (!/^\d{1,2}$/.test(r)) break;
    answers.push(Number(r));
  }
  return symptom ? { symptom, answers } : null;
}

/** Every problem in the tree, as readable strings. An empty list means the tree is sound. */
export function validate(data, categories) {
  const errors = [];
  const nodes = data.nodes || {};
  const reached = new Set();

  const visit = (id, path) => {
    if (path.includes(id)) { errors.push(`loop: ${[...path, id].join(' → ')}`); return; }
    const node = nodes[id];
    if (!node) { errors.push(`missing node "${id}" (from ${path.at(-1) || 'a symptom'})`); return; }
    reached.add(id);
    if (isResult(node)) return;
    if (!node.q || !Array.isArray(node.options) || node.options.length < 2) {
      errors.push(`${id}: a question needs "q" and at least 2 options`);
      return;
    }
    for (const o of node.options) {
      if (!o.label) errors.push(`${id}: option without a label`);
      visit(o.next, [...path, id]);
    }
  };

  const ids = new Set();
  for (const s of data.symptoms || []) {
    if (ids.has(s.id)) errors.push(`duplicate symptom "${s.id}"`);
    if (s.id.includes('.')) errors.push(`symptom id "${s.id}" can't contain "."`);
    ids.add(s.id);
    if (!s.label) errors.push(`${s.id}: no label`);
    visit(s.start, []);
  }

  for (const [id, node] of Object.entries(nodes)) {
    if (!reached.has(id)) errors.push(`${id}: no question leads here`);
    if (!isResult(node)) continue;
    if (!node.title || !node.why) errors.push(`${id}: a result needs "title" and "why"`);
    if (node.steps.length < 2) errors.push(`${id}: a result needs at least 2 steps`);
    if (!Array.isArray(node.cats)) errors.push(`${id}: "cats" must be a list (can be empty)`);
    for (const c of node.cats || []) if (!categories.includes(c)) errors.push(`${id}: unknown category "${c}"`);
    if (typeof node.open !== 'boolean') errors.push(`${id}: "open" (does this open the case?) must be true or false`);
  }
  return errors;
}
