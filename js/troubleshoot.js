// Troubleshooter page (/troubleshoot/): pick a symptom, answer a few questions, get safe step-by-step checks.
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
const BACK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 3 4.5 6l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let data;
let first = true;

const readPath = () => decodePath(new URLSearchParams(location.hash.slice(1)).get('t'));
const go = (symptom, answers = []) => { location.hash = symptom ? `t=${encodePath(symptom, answers)}` : ''; };

function render() {
  const path = readPath();
  const at = path && walk(data, path.symptom, path.answers);
  if (!at || !at.node) app.innerHTML = renderStart();
  else if (isResult(at.node)) app.innerHTML = renderResult(at);
  else app.innerHTML = renderQuestion(at);
  app.dataset.view = !at || !at.node ? 'start' : isResult(at.node) ? 'result' : 'question';
  // after a tap, bring the new step into view and move focus to it (not on first load)
  if (!first) {
    const h = app.querySelector('[data-focus]');
    h?.focus({ preventScroll: true });
    const top = app.getBoundingClientRect().top;
    if (top < 70 || top > innerHeight * 0.5) app.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  }
  first = false;
}

function renderStart() {
  return `
    <h3 class="ts-q" tabindex="-1" data-focus>Ano ang nangyayari sa PC mo?</h3>
    <div class="ts-symptoms">
      ${data.symptoms.map((s) => `
        <button type="button" class="ts-symptom" data-symptom="${esc(s.id)}">
          <span class="ts-symptom-text"><strong>${esc(s.label)}</strong><span>${esc(s.sub)}</span></span>
          ${CHEVRON}
        </button>`).join('')}
      <form class="ts-symptom ts-ask" data-ask-form>
        <label class="ts-symptom-text" for="ts-ask-input"><strong>Wala sa listahan?</strong><span>I-type ang problema o tanong mo, sasagutin ni Ark.</span></label>
        <span class="ts-ask-row">
          <input id="ts-ask-input" type="text" maxlength="200" enterkeyhint="send" autocomplete="off" placeholder="hal. naglalag ang PC pag naglalaro">
          <button type="submit" class="ts-ask-send" aria-label="Itanong kay Ark">${CHEVRON}</button>
        </span>
      </form>
    </div>`;
}

function crumbs(at) {
  const n = at.trail.length + 1;
  return `<p class="ts-crumb"><span>${esc(at.symptom.label)}</span>${isResult(at.node) ? '' : `<span>Tanong ${n}</span>`}</p>`;
}

function nav(at) {
  const back = at.trail.length
    ? `<button type="button" class="btn btn-glass btn-sm" data-back>${BACK}Bumalik</button>`
    : '';
  return `<div class="ts-nav">${back}<button type="button" class="btn btn-glass btn-sm" data-restart>Ibang problema</button></div>`;
}

function renderQuestion(at) {
  const { node } = at;
  return `
    ${crumbs(at)}
    <h3 class="ts-q" tabindex="-1" data-focus>${esc(node.q)}</h3>
    ${node.help ? `<p class="ts-help">${esc(node.help)}</p>` : ''}
    <div class="ts-options">
      ${node.options.map((o, i) => `<button type="button" class="ts-option" data-pick="${i}"><span>${esc(o.label)}</span>${CHEVRON}</button>`).join('')}
      <button type="button" class="ts-option ts-option-other" data-ark-type><span>Wala sa pagpipilian? I-type ang sagot o tanong mo</span>${CHEVRON}</button>
    </div>
    ${nav(at)}`;
}

function renderResult(at) {
  const { node } = at;
  const answered = at.trail.map((t) => `<li><span>${esc(t.node.q)}</span><strong>${esc(t.node.options[t.picked].label)}</strong></li>`).join('');
  const shop = node.cats.filter((c) => CATEGORIES.includes(c)).map((c) => `
    <a class="ts-cat" href="${ROOT}parts/#cat=${c}" data-cat="${c}">
      <span class="ts-cat-icon">${ICONS[c]}</span><span>Tingnan ang mga ${esc(CATEGORY_LABEL[c])}</span>${CHEVRON}
    </a>`).join('');
  return `
    ${crumbs(at)}
    <p class="ts-kicker">Malamang na dahilan</p>
    <h3 class="ts-title" tabindex="-1" data-focus>${esc(node.title)}</h3>
    <p class="ts-why">${esc(node.why)}</p>
    ${node.open ? `<p class="ts-warn" role="note"><strong>Bago buksan ang case:</strong> patayin ang PC, i-off ang switch ng PSU at bunutin ang power cable. Humawak muna sa metal ng case para mawala ang static. Huwag kailanman buksan ang PSU.</p>` : ''}
    <h4 class="ts-sub">Gawin ito, isa-isa</h4>
    <ol class="ts-steps">${node.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${shop ? `<div class="ts-shop"><h4 class="ts-sub">Kung kailangan nang palitan</h4>${shop}</div>` : ''}
    ${answered ? `<details class="ts-answers"><summary>Mga sagot mo</summary><ul>${answered}</ul></details>` : ''}
    <button type="button" class="btn btn-glass btn-sm ts-ark" data-ark="${esc(node.cats[0] || 'pc')}"><span class="ark-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 19 20h-3.2l-1.5-3.8H9.7L8.2 20H5L12 3.5Zm0 6.2-1.4 3.8h2.8L12 9.7Z" fill="currentColor"/></svg></span>May tanong pa? Itanong kay Ark</button>
    <p class="ts-more">Hindi pa rin ayos? <a href="${PM_URL}" rel="noopener" target="_blank">I-PM ang ReSpecz page</a> at sabihin ang mga sagot mo dito${GROUP_URL ? `, o <a href="${GROUP_URL}" rel="noopener" target="_blank">sumali sa ReSpecz private group</a>` : `, o <a href="${PAGE_URL}" rel="noopener" target="_blank">i-follow ang page</a> para sa updates`}. ${esc(data.meta.note)}</p>
    ${nav(at)}`;
}

app.addEventListener('click', (e) => {
  const path = readPath();
  const t = e.target;
  const s = t.closest('[data-symptom]');
  if (s) return go(s.dataset.symptom);
  const pick = t.closest('[data-pick]');
  if (pick && path) return go(path.symptom, [...path.answers, Number(pick.dataset.pick)]);
  if (t.closest('[data-back]') && path) {
    // drop the last answer that was actually used (a bad link may carry extra ones)
    const at = walk(data, path.symptom, path.answers);
    return go(path.symptom, path.answers.slice(0, Math.max(0, at.trail.length - 1)));
  }
  if (t.closest('[data-restart]')) return go(null);
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
