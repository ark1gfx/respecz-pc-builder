// Ark, ang Assistant ni ReSpecz: chat panel on every page.
// Opens on a part picker → that part's prepared questions → answer in chat style. Visitors can also type;
// typed questions go through ark-core (catalog math first, then the knowledge base). Data loads on first open.
import { CATEGORIES } from './compat.js';
import { ICONS } from './icons.js';
import { indexKb, match, computeAnswer, redact } from './ark-core.js';
import { PAGE_URL, PM_URL, GROUP_URL, LOG_URL } from './contact.js';

const ROOT = new URL('../', import.meta.url).href;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const GROUP_ICONS = {
  ...ICONS,
  pc: svg('<rect x="2.5" y="4" width="12" height="9" rx="1.5"/><path d="M6 16.5h5M8.5 13v3.5"/><rect x="16.5" y="4" width="5" height="14" rx="1.2"/><path d="M18 7h2M18 9h2"/><circle cx="19" cy="14.5" r="1"/>'),
  buy: svg('<path d="M5 8h14l-1.3 10.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
};
const AVATAR = '<span class="ark-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 19 20h-3.2l-1.5-3.8H9.7L8.2 20H5L12 3.5Zm0 6.2-1.4 3.8h2.8L12 9.7Z" fill="currentColor"/></svg></span>';
const GRID = svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>');
const SEND = svg('<path d="M5 12h13M13 6l6 6-6 6"/>');

let kb, index, parts, loading;
let group = null; // the part picked last, nudges typed questions toward it
let dlg, log, input;

// ---------- data ----------
function load() {
  loading ||= Promise.all([
    fetch(new URL('data/ark.json', ROOT)).then((r) => { if (!r.ok) throw new Error(`ark.json ${r.status}`); return r.json(); }),
    fetch(new URL('data/parts.json', ROOT)).then((r) => (r.ok ? r.json() : { parts: [] })).catch(() => ({ parts: [] })),
  ]).then(([k, p]) => { kb = k; index = indexKb(k); parts = p.parts || []; });
  return loading;
}
const entry = (id) => kb.entries.find((e) => e.id === id);
const groupOf = (id) => kb.groups.find((g) => g.id === id);

// ---------- panel ----------
function build() {
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ark-fab';
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.innerHTML = `${AVATAR}<span>Ark</span>`;
  fab.setAttribute('aria-label', 'Buksan si Ark, ang Assistant ni ReSpecz');
  fab.addEventListener('click', () => open());
  document.body.append(fab);

  dlg = document.createElement('dialog');
  dlg.className = 'ark';
  dlg.setAttribute('aria-labelledby', 'ark-title');
  dlg.innerHTML = `
    <div class="ark-panel">
      <header class="ark-head">
        ${AVATAR}
        <div class="ark-id"><h2 id="ark-title">Ark</h2><p>Ang Assistant ni ReSpecz</p></div>
        <button type="button" class="ark-icon-btn" data-picker aria-label="Pumili ng part">${GRID}</button>
        <button type="button" class="ark-icon-btn" data-close aria-label="Isara">✕</button>
      </header>
      <div class="ark-log" role="log" aria-live="polite" aria-label="Usapan kay Ark"></div>
      <form class="ark-form" autocomplete="off">
        <label class="sr-only" for="ark-input">Itanong kay Ark</label>
        <input id="ark-input" type="text" enterkeyhint="send" maxlength="200" placeholder="I-type ang tanong mo…">
        <button type="submit" class="ark-send" aria-label="Ipadala">${SEND}</button>
      </form>
      <p class="ark-note"></p>
    </div>`;
  document.body.append(dlg);
  log = dlg.querySelector('.ark-log');
  input = dlg.querySelector('#ark-input');

  dlg.addEventListener('click', onClick);
  // tap outside the panel closes it
  dlg.addEventListener('pointerdown', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    ask(q);
  });
}

async function open({ group: g, q, focus } = {}) {
  hidePop();
  store(localStorage, 'ark-used', String(Date.now())); // opened Ark: no more nudges for a week
  if (!dlg.open) dlg.showModal();
  document.documentElement.classList.add('ark-open');
  if (!kb) {
    log.innerHTML = '<div class="ark-row ark-bot"><div class="ark-bubble"><span class="ark-typing"><i></i><i></i><i></i></span></div></div>';
    try { await load(); } catch (err) {
      console.error(err);
      log.innerHTML = `<div class="ark-row ark-bot"><div class="ark-bubble">Hindi ma-load si Ark ngayon. I-refresh ang page o subukan ulit mamaya.</div></div>`;
      return;
    }
    dlg.querySelector('.ark-note').textContent = kb.meta.note + (LOG_URL ? ' Itinatala ang mga tanong na hindi nasagot, walang pangalan, para madagdagan ang sagot. Huwag maglagay ng personal info.' : '');
    log.innerHTML = '';
    await say(`Hi! Ako si ${kb.meta.name}, ang Assistant ni ReSpecz. Anong part ang may tanong o problema ka? Pwede ka ring mag-type ng tanong sa baba.`, { after: pickerHtml() });
  }
  if (g && groupOf(g)) await pick(g);
  if (q) await ask(q);
  if (focus || matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
}

function pickerHtml() {
  return `<div class="ark-parts">${kb.groups.map((g) => `
    <button type="button" class="ark-part" data-group="${g.id}">
      <span class="ark-part-icon">${GROUP_ICONS[g.id] || ''}</span>
      <span class="ark-part-text"><strong>${esc(g.label)}</strong><span>${esc(g.sub)}</span></span>
    </button>`).join('')}</div>`;
}

// ---------- conversation ----------
function addRow(who, html) {
  const row = document.createElement('div');
  row.className = `ark-row ark-${who}`;
  row.innerHTML = html;
  log.append(row);
  scrollDown(true);
  return row;
}
function scrollDown(force) {
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 140;
  if (force || near) log.scrollTop = log.scrollHeight;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));

/** Ark "types": dots first, then the text streams in, then links and chips appear. */
async function say(text, { after = '' } = {}) {
  const row = addRow('bot', `${AVATAR}<div class="ark-bubble"><span class="ark-typing" aria-label="Nagta-type si Ark"><i></i><i></i><i></i></span></div>`);
  const bubble = row.querySelector('.ark-bubble');
  await sleep(380 + Math.min(500, text.length * 2));
  bubble.innerHTML = '<p class="ark-text"></p>';
  const p = bubble.firstChild;
  if (reducedMotion || document.hidden) p.textContent = text;
  else {
    // stream a few characters per tick; long answers go faster so nobody waits more than ~1.2s.
    // A timer, not requestAnimationFrame, so a backgrounded tab still finishes the answer.
    const step = Math.max(2, Math.ceil(text.length / 70));
    for (let i = 0; i < text.length; i += step) {
      p.textContent = text.slice(0, i + step);
      scrollDown();
      await new Promise((r) => setTimeout(r, 16));
    }
  }
  if (after) bubble.insertAdjacentHTML('beforeend', after);
  // show the new answer: the start of it when it's taller than the log, otherwise the bottom
  if (row.offsetHeight > log.clientHeight) log.scrollTop = row.offsetTop - log.offsetTop - 8;
  else scrollDown(true);
  return row;
}

function userSays(text) { addRow('user', `<div class="ark-bubble">${esc(text)}</div>`); }

async function pick(id) {
  const g = groupOf(id);
  if (!g) return;
  group = id;
  userSays(g.label);
  const list = kb.entries.filter((e) => e.group === id && !e.hidden);
  const first = list.slice(0, 6);
  const rest = list.slice(6);
  await say(`Mga madalas itanong tungkol sa ${g.id === 'pc' ? 'buong PC' : g.id === 'buy' ? 'pagbili' : g.label}. Pumili, o i-type ang sarili mong tanong:`, {
    after: `<div class="ark-chips">${first.map(chip).join('')}${rest.length ? `<button type="button" class="ark-chip ark-chip-more" data-more>Iba pa (${rest.length})</button><span class="ark-more" hidden>${rest.map(chip).join('')}</span>` : ''}${backChip()}</div>`,
  });
}

const chip = (e) => `<button type="button" class="ark-chip" data-ask="${esc(e.id)}">${esc(e.q)}</button>`;
const backChip = () => '<button type="button" class="ark-chip ark-chip-back" data-picker>← Ibang part</button>';

async function ask(text, fromEntry) {
  const asked = fromEntry ? fromEntry.q : text;
  userSays(asked);
  // "Hindi ito ang hinahanap ko" under every answer: saves the question for the weekly review
  const miss = (id) => `<button type="button" class="ark-miss" data-miss="${esc(id)}" data-q="${esc(asked)}">Hindi ito ang hinahanap ko</button>`;
  // a prepared question answers itself; typed text tries the catalog math first (it names real parts)
  const calc = (!fromEntry || fromEntry.compute) && parts?.length ? computeAnswer(text, parts) : null;
  if (calc) return say(calc.text, { after: linksHtml(calc.links) + miss(calc.id) + chipsHtml([]) });
  const e = fromEntry && !fromEntry.compute ? fromEntry : match(index, text, { group }).best;
  if (e) return say(e.a, { after: linksHtml(e.links) + miss(e.id) + chipsHtml((e.next || []).map(entry).filter(Boolean)) });
  const { alternatives } = match(index, text, { group });
  if (alternatives.length) {
    logMiss(text, 'unsure');
    return say('Hindi ako sigurado sa tanong mo. Ito ba ang ibig mong sabihin?', {
      after: `<div class="ark-chips">${alternatives.map(chip).join('')}</div>${helpHtml(asked)}${chipsHtml([])}`,
    });
  }
  logMiss(text, 'none');
  return say('Pasensya, wala pa sa alam ko ang tanong na iyan. Itatala ko ito para madagdagan ang sagot ko. Habang wala pa, pwede mong i-PM ang ReSpecz page, gamitin ang Troubleshooter, o i-type ulit nang mas maikli (hal. "walang display", "ilang watts ng PSU").', {
    after: helpHtml(asked) + chipsHtml([]),
  });
}

/** When Ark can't help: PM the page (the question is copied first), the group (or follow the page until it opens), the Troubleshooter. */
function helpHtml(q) {
  const group = GROUP_URL
    ? `<a class="ark-link" href="${esc(GROUP_URL)}" target="_blank" rel="noopener">Sumali sa ReSpecz private group ›</a>`
    : `<a class="ark-link" href="${esc(PAGE_URL)}" target="_blank" rel="noopener">I-follow ang ReSpecz page para sa updates ›</a>`;
  return `<div class="ark-links">
    <a class="ark-link ark-link-pm" href="${esc(PM_URL)}" target="_blank" rel="noopener" data-pm="${esc(q)}">I-PM ang ReSpecz page (kokopyahin ko ang tanong mo) ›</a>
    ${group}
    <a class="ark-link" href="${ROOT}troubleshoot/" data-leave>Buksan ang Troubleshooter ›</a>
  </div>`;
}

// ---------- unanswered questions → Google Sheet (only when LOG_URL is set in contact.js) ----------
const sentLog = new Set();
function logMiss(q, kind, entryId = '') {
  if (!LOG_URL || sentLog.size >= 15) return;
  const clean = redact(q);
  if (!clean || sentLog.has(kind + clean)) return;
  sentLog.add(kind + clean);
  const body = JSON.stringify({ q: clean, kind, entry: entryId, group: group || '', page: location.pathname });
  // text/plain + no-cors: a "simple" request Apps Script accepts without a CORS preflight
  fetch(LOG_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }).catch(() => {});
}

function linksHtml(links = []) {
  const items = links.map((l) => {
    if (l.cat && CATEGORIES.includes(l.cat)) {
      const g = groupOf(l.cat);
      return `<a class="ark-link" href="${ROOT}parts/#cat=${l.cat}" data-cat="${l.cat}"><span class="ark-link-icon">${ICONS[l.cat]}</span>Tingnan ang mga ${esc(g?.label || l.cat)}</a>`;
    }
    if (l.ts !== undefined) return `<a class="ark-link" href="${ROOT}troubleshoot/${l.ts ? `#t=${l.ts}` : ''}" data-leave>${esc(l.label)} ›</a>`;
    if (l.page) return `<a class="ark-link" href="${ROOT}${l.page}" data-leave>${esc(l.label)} ›</a>`;
    if (l.href) return `<a class="ark-link" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} ›</a>`;
    return '';
  }).join('');
  return items ? `<div class="ark-links">${items}</div>` : '';
}
const chipsHtml = (list) => `<div class="ark-chips">${list.map(chip).join('')}${backChip()}</div>`;

function onClick(e) {
  const t = e.target;
  if (t.closest('[data-close]')) return dlg.close();
  const missBtn = t.closest('[data-miss]');
  if (missBtn) {
    logMiss(missBtn.dataset.q, 'unhelpful', missBtn.dataset.miss);
    missBtn.disabled = true;
    missBtn.textContent = 'Salamat, naitala';
    return say('Salamat sa feedback! Itatala ko ito para mas mapabuti ang sagot ko. Kung kailangan mo ng tulong ngayon:', { after: helpHtml(missBtn.dataset.q) + chipsHtml([]) });
  }
  const pm = t.closest('[data-pm]');
  if (pm) { navigator.clipboard?.writeText(pm.dataset.pm).catch(() => {}); return; } // the link itself opens Messenger
  const g = t.closest('[data-group]');
  if (g) return pick(g.dataset.group);
  if (t.closest('[data-picker]')) {
    userSays('Ibang part');
    return say('Sige, anong part?', { after: pickerHtml() });
  }
  const more = t.closest('[data-more]');
  if (more) { more.nextElementSibling.hidden = false; more.remove(); return; }
  const a = t.closest('[data-ask]');
  if (a) { const en = entry(a.dataset.ask); if (en) ask(en.q, en); return; }
  const cat = t.closest('a[data-cat]');
  if (cat && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    // the product list opens above Ark (no 3D); closing it comes back here. The /parts/ link is the fallback.
    const handled = !dispatchEvent(new CustomEvent('respecz:open-cat', { detail: { cat: cat.dataset.cat }, cancelable: true }));
    if (handled) e.preventDefault();
    return;
  }
  // links to another page (or this one, e.g. a Troubleshooter step) close the panel
  if (t.closest('a[data-leave]')) dlg.close();
}

// ---------- the nudge: "May tanong ka ba? I-chat mo lang ako" ----------
// Once per visit, ~8s in (or after a bit of scrolling), gone after ~8s or on ×. Never while a popup is open,
// never again this visit once closed, and not for a week after someone has used Ark.
const POP_DELAY = 8000;
const POP_SHOWN_FOR = 8000;
const WEEK = 7 * 24 * 3600 * 1000;
let pop, popTimer;
function store(area, key, value) {
  try { if (value === undefined) return area.getItem(key); area.setItem(key, value); } catch { return null; }
  return null;
}
function hidePop() {
  clearTimeout(popTimer);
  if (!pop || pop.hidden) return;
  pop.classList.remove('is-in');
  setTimeout(() => { if (pop) pop.hidden = true; }, reducedMotion ? 0 : 250);
}
function showPop() {
  if (document.hidden || document.querySelector('dialog[open]') || document.querySelector('.viewer-full')) {
    popTimer = setTimeout(showPop, 4000); // busy now: try again a bit later
    return;
  }
  store(sessionStorage, 'ark-pop', '1');
  pop.hidden = false;
  requestAnimationFrame(() => pop.classList.add('is-in'));
  popTimer = setTimeout(hidePop, POP_SHOWN_FOR);
}
function setupPop() {
  const used = Number(store(localStorage, 'ark-used')) || 0;
  if (store(sessionStorage, 'ark-pop') || Date.now() - used < WEEK) return;
  pop = document.createElement('div');
  pop.className = 'ark-pop';
  pop.hidden = true;
  pop.innerHTML = `<button type="button" class="ark-pop-body">${AVATAR}<span><strong>May tanong ka ba?</strong> I-chat mo lang ako.</span></button>
    <button type="button" class="ark-pop-x" aria-label="Isara">✕</button>`;
  pop.querySelector('.ark-pop-body').addEventListener('click', () => open());
  pop.querySelector('.ark-pop-x').addEventListener('click', () => { store(sessionStorage, 'ark-pop', '1'); hidePop(); });
  document.body.append(pop);
  let start = setTimeout(showPop, POP_DELAY);
  // someone reading down the page is a good moment too (after at least 3s on the page)
  const t0 = Date.now();
  const onScroll = () => {
    if (Date.now() - t0 < 3000 || scrollY < innerHeight * 0.6) return;
    removeEventListener('scroll', onScroll);
    clearTimeout(start);
    if (pop.hidden && !store(sessionStorage, 'ark-pop')) showPop();
  };
  addEventListener('scroll', onScroll, { passive: true });
}

build();
setupPop();
dlg.addEventListener('close', () => document.documentElement.classList.remove('ark-open'));
// other modules (the Troubleshooter) open Ark on a part or with a question
addEventListener('respecz:open-ark', (e) => open(e.detail || {}));
