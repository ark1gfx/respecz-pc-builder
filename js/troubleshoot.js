// Troubleshooter page (/troubleshoot/): a flowchart. Pick the area on top, answer Oo/Hindi down the ladder, get the fix.
// The tree lives in data/troubleshoot.json; the logic is in troubleshoot-core.js. Where we are is kept in
// the URL hash (#t=nodisplay.0.1) so the browser Back button and shared links work.
import { CATEGORIES, CATEGORY_LABEL } from './compat.js';
import { ICONS } from './icons.js';
import { walk, isResult, encodePath, decodePath } from './troubleshoot-core.js';
import { PAGE_URL, PM_URL, GROUP_URL } from './contact.js';

const ROOT = new URL('../', import.meta.url).href;
const app = document.getElementById('ts-app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 3 7.5 6l-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let data;
let first = true;

const readPath = () => decodePath(new URLSearchParams(location.hash.slice(1)).get('t'));
const go = (symptom, answers = []) => { location.hash = symptom ? `t=${encodePath(symptom, answers)}` : ''; };

const svg = (b) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
const AREA_ICONS = {
  ...ICONS,
  power: svg('<path d="M12 3v8"/><path d="M6.5 6.8a7.5 7.5 0 1 0 11 0"/>'),
  display: svg('<rect x="3" y="4" width="18" height="12" rx="1.8"/><path d="M9 20h6M12 16v4"/>'),
  heat: svg('<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z"/><path d="M12 10v6"/>'),
  games: svg('<path d="M7 8h10a4 4 0 0 1 3.9 4.9l-.8 3.4a2 2 0 0 1-3.4.9L14.5 15h-5l-2.2 2.2a2 2 0 0 1-3.4-.9l-.8-3.4A4 4 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>'),
  audio: svg('<path d="M4 10v4h3.5L12 18V6L7.5 10z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  net: svg('<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r=".8"/>'),
};
const ARK_AVATAR = '<span class="ark-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 19 20h-3.2l-1.5-3.8H9.7L8.2 20H5L12 3.5Zm0 6.2-1.4 3.8h2.8L12 9.7Z" fill="currentColor"/></svg></span>';

// The whole chart is drawn every time: areas on top, then one card per answered question, joined by
// arrows labelled with the answer, down to the current question or the fix.
function render() {
  const path = readPath();
  const at = path && walk(data, path.symptom, path.answers);
  const area = at?.symptom?.id;
  app.dataset.view = !at ? 'start' : isResult(at.node) ? 'result' : 'question';
  app.innerHTML = `
    <h3 class="tsf-title" ${at ? '' : 'tabindex="-1" data-focus'}>Saan ang problema?</h3>
    <div class="tsf-areas${area ? ' has-pick' : ''}" role="list">
      ${data.symptoms.map((s) => `
        <button type="button" role="listitem" class="tsf-area${s.id === area ? ' is-on' : ''}" data-symptom="${esc(s.id)}" aria-pressed="${s.id === area}">
          <span class="tsf-area-art" aria-hidden="true"><img src="${ROOT}assets/ts/${esc(s.id)}.webp" alt="" width="240" height="240" loading="lazy" decoding="async"></span>
          <strong>${esc(s.label)}</strong><span>${esc(s.sub)}</span>
        </button>`).join('')}
    </div>
    ${at ? ladder(at) : askForm()}`;
  // after a tap, bring the newest card into view and move focus to it (not on first load)
  if (!first) {
    const target = app.querySelector('[data-focus]');
    target?.focus({ preventScroll: true });
    const card = target?.closest('.tsf-node') || target;
    const r = card?.getBoundingClientRect();
    if (r && (r.top < 80 || r.bottom > innerHeight - 90)) card.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  }
  first = false;
}

function askForm() {
  return `
    <form class="tsf-ask" data-ask-form>
      <label for="ts-ask-input">Wala dito? I-type ang problema mo:</label>
      <span class="ts-ask-row">
        <input id="ts-ask-input" type="text" maxlength="200" enterkeyhint="send" autocomplete="off" placeholder="hal. naglalag pag naglalaro">
        <button type="submit" class="ts-ask-send" aria-label="Itanong kay Ark">${CHEVRON}</button>
      </span>
    </form>`;
}

const arrow = (label) => `<div class="tsf-arrow" aria-hidden="true">${label ? `<span class="tsf-arrow-label">${esc(label)}</span>` : ''}</div>`;

function ladder(at) {
  const steps = at.trail.map((t, i) => `
    ${arrow(i ? at.trail[i - 1].node.options[at.trail[i - 1].picked].label : '')}
    <div class="tsf-node is-done">
      <p class="tsf-q">${esc(t.node.q)}</p>
      <div class="tsf-yn">${t.node.options.map((o, j) => `<button type="button" class="tsf-btn ${j === t.picked ? 'is-picked' : 'is-off'}" data-change="${i}.${j}" aria-pressed="${j === t.picked}">${esc(o.label)}</button>`).join('')}</div>
    </div>`).join('');
  const lastLabel = at.trail.length ? at.trail.at(-1).node.options[at.trail.at(-1).picked].label : '';
  return `<div class="tsf-ladder">${steps}${arrow(lastLabel)}${isResult(at.node) ? resultCard(at) : questionCard(at)}</div>`;
}

function questionCard(at) {
  const { node } = at;
  return `
    <div class="tsf-node is-current">
      <p class="tsf-step">Tanong ${at.trail.length + 1}</p>
      <p class="tsf-q tsf-q-big" tabindex="-1" data-focus>${esc(node.q)}</p>
      ${node.help ? `<p class="tsf-help">${esc(node.help)}</p>` : ''}
      <div class="tsf-yn tsf-yn-big">${node.options.map((o, i) => `<button type="button" class="tsf-btn ${i === 0 ? 'is-yes' : 'is-no'}" data-pick="${i}">${esc(o.label)}</button>`).join('')}</div>
      <button type="button" class="tsf-link" data-ark-type>Hindi sigurado? Itanong kay Ark</button>
    </div>`;
}

function resultCard(at) {
  const { node } = at;
  const shop = node.cats.filter((c) => CATEGORIES.includes(c)).map((c) => `
    <a class="ts-cat" href="${ROOT}parts/#cat=${c}" data-cat="${c}">
      <span class="ts-cat-icon">${ICONS[c]}</span><span>Tingnan ang mga ${esc(CATEGORY_LABEL[c])}</span>${CHEVRON}
    </a>`).join('');
  return `
    <div class="tsf-node is-result">
      <p class="tsf-step">Ayusin ito</p>
      <h3 class="ts-title" tabindex="-1" data-focus>${esc(node.title)}</h3>
      <ol class="ts-steps">${(node.short || node.steps).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${node.open ? '<p class="ts-warn" role="note"><strong>Safety:</strong> patayin at bunutin muna. Huwag buksan ang PSU.</p>' : ''}
      ${shop ? `<div class="ts-shop">${shop}</div>` : ''}
      <details class="ts-answers"><summary>Buong steps at paliwanag</summary>
        <p class="ts-why">${esc(node.why)}</p>
        <ol class="ts-steps ts-steps-full">${node.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      </details>
      <div class="ts-nav">
        <button type="button" class="btn btn-glass btn-sm ts-ark" data-ark="${esc(node.cats[0] || 'pc')}">${ARK_AVATAR}Itanong kay Ark</button>
        <button type="button" class="btn btn-glass btn-sm" data-restart>Ulitin</button>
      </div>
      <p class="ts-more">Hindi pa rin ayos? <a href="${PM_URL}" rel="noopener" target="_blank">I-PM ang ReSpecz page</a>${GROUP_URL ? ` o <a href="${GROUP_URL}" rel="noopener" target="_blank">sumali sa private group</a>` : ` o <a href="${PAGE_URL}" rel="noopener" target="_blank">i-follow ang page</a>`}.</p>
    </div>`;
}

app.addEventListener('click', (e) => {
  const path = readPath();
  const t = e.target;
  const s = t.closest('[data-symptom]');
  if (s) return go(s.dataset.symptom);
  const pick = t.closest('[data-pick]');
  if (pick && path) return go(path.symptom, [...path.answers, Number(pick.dataset.pick)]);
  // tap an earlier answer to change it: the chart re-draws from that step
  const change = t.closest('[data-change]');
  if (change && path) {
    const [i, j] = change.dataset.change.split('.').map(Number);
    return go(path.symptom, [...path.answers.slice(0, i), j]);
  }
  if (t.closest('[data-restart]')) return go(path?.symptom || null);
  if (t.closest('[data-ark-type]')) return openArk({ focus: true });
  const ark = t.closest('[data-ark]');
  if (ark) return dispatchEvent(new CustomEvent('respecz:open-ark', { detail: { group: ark.dataset.ark } }));
  // part category: open the product list on this page (app.js listens); the link to /parts/ is the fallback
  const cat = t.closest('a[data-cat]');
  if (cat && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    const handled = !dispatchEvent(new CustomEvent('respecz:open-cat', { detail: { cat: cat.dataset.cat }, cancelable: true }));
    if (handled) e.preventDefault();
  }
});

const openArk = (detail) => dispatchEvent(new CustomEvent('respecz:open-ark', { detail }));
// "Wala sa listahan?": the visitor's own words go straight to Ark
app.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-ask-form]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input');
  const q = input.value.trim();
  if (!q) { input.focus(); return; }
  input.value = '';
  openArk({ q });
});

async function init() {
  try {
    const res = await fetch(new URL('data/troubleshoot.json', ROOT));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error(err);
    app.innerHTML = '<p class="error">Hindi ma-load ang troubleshooter. I-refresh ang page.</p>';
    return;
  }
  addEventListener('hashchange', render);
  render();
}

init();
