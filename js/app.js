import { CATEGORIES, CATEGORY_LABEL, checkBuild, estimateLoad, totalPrice } from './compat.js';
import { suggestBuild, USE_CASES, PREFS, DEFAULT_PREFS, availablePrefs, gpuVendor } from './picker.js';
import { ICONS } from './icons.js';
import { addToBasket, initBasket, openBasket } from './basket.js';
import { OWNED_CATS, fits, ownedOptions, encodeOwned, decodeOwned, suggestForOwned } from './owned.js';

const $ = (sel) => document.querySelector(sel);
// Site root (one level above js/), so every page (/, /build/, /may/…) finds data and links the same way.
const ROOT = new URL('../', import.meta.url).href;
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const MIN_BUDGET = 35000;
const MAX_BUDGET = 250000;
const BUDGET_PRESETS = [40000, 50000, 60000, 80000, 100000, 130000, 160000];
const SHORT_LABEL = { cpu: 'CPU', motherboard: 'Motherboard', ram: 'RAM', gpu: 'GPU', ssd: 'SSD', psu: 'PSU', case: 'Case', cooler: 'Cooler' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = { budget: 60000, useCase: 'gaming', prefs: { ...DEFAULT_PREFS }, build: null, owned: {} };
let catalog = { parts: [], byId: new Map(), meta: {} };
let pc3d = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capacity = (gb) => (gb >= 1000 ? `${gb / 1000}TB` : `${gb}GB`);
const partsOf = (cat) => catalog.parts.filter((p) => p.category === cat && !p.stock).sort((a, b) => a.price - b.price);

function specLine(p) {
  switch (p.category) {
    case 'cpu': return `${p.socket} · ${p.cores} · ${p.tdp}W${p.igpu ? ' · may graphics' : ''}`;
    case 'motherboard': return `${p.socket} · ${p.chipset} · ${p.formFactor} · ${p.memType} x${p.memSlots}${p.wifi ? ' · WiFi' : ''}`;
    case 'ram': return `${p.memType}-${p.speed} · ${p.sticks}x${p.capacityGB / p.sticks}GB`;
    case 'gpu': return `${p.vramGB}GB VRAM · ${p.tdp}W · ${p.lengthMm}mm`;
    case 'ssd': return `${p.interface} · ${capacity(p.capacityGB)}`;
    case 'psu': return `${p.watts}W · ${p.rating}`;
    case 'case': return `${p.formFactors.join(' / ')} · GPU hanggang ${p.maxGpuMm}mm`;
    case 'cooler': return p.stock ? 'Kasama na sa box ng CPU' : `${p.type === 'aio' ? '240mm liquid (AIO)' : `Air tower ${p.heightMm}mm`} · ${p.tdpRating}W`;
    default: return '';
  }
}

function thumb(p, cat) {
  const icon = ICONS[cat || p?.category];
  if (!p?.image) return `<span class="thumb-icon">${icon}</span>`;
  return `<img class="thumb-img" data-cat="${cat || p.category}" src="${esc(p.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

// If a Shopee image fails to load, fall back to our own icon.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('thumb-img')) return;
  const span = document.createElement('span');
  span.className = 'thumb-icon';
  span.innerHTML = ICONS[img.dataset.cat] || '';
  img.replaceWith(span);
}, true);

function shopButton(p, extraClass = '', label = 'Shopee Checkout') {
  if (!p?.shopeeUrl) return '';
  return `<a class="btn btn-shop ${extraClass}" href="${esc(p.shopeeUrl)}" target="_blank" rel="sponsored noopener" data-part="${esc(p.id)}" data-tip="Bubuksan sa Shopee (bagong tab)">${label}</a>`;
}

// Add-to-Basket uses the same basket icon as the nav and the Basket button (with a small plus), never a bare "+".
const BASKET_ADD_ICON = '<svg class="ic-basket" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.3 10.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/><path d="M12 11.5v5M9.5 14h5"/></svg>';
function basketButton(id) {
  return `<button type="button" class="btn btn-glass btn-sm btn-basket" data-add="${esc(id)}">${BASKET_ADD_ICON}<span>Basket</span></button>`;
}

// ---------- URL hash (shareable builds) ----------
function buildHash(build, useCase, budget, prefs = {}) {
  const ids = CATEGORIES.map((c) => build[c]?.id || '-').join(',');
  const pr = Object.entries(prefs).filter(([, v]) => v !== 'any').map(([k, v]) => `&${PREF_KEYS[k]}=${v}`).join('');
  return `#u=${useCase}&b=${budget}${pr}&p=${ids}`;
}

function writeHash() {
  if (!state.build) return;
  history.replaceState(null, '', buildHash(state.build, state.useCase, state.budget, state.prefs));
}

const PREF_KEYS = { cpuBrand: 'c', gpuBrand: 'g', formFactor: 'f' };

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  for (const [k, short] of Object.entries(PREF_KEYS)) {
    const v = params.get(short);
    if (PREFS[k].options.some(([o]) => o === v)) state.prefs[k] = v;
  }
  if (params.has('may')) state.owned = decodeOwned(params.get('may'), catalog.byId);
  if (USE_CASES[params.get('u')]) state.useCase = params.get('u');
  const b = Number(params.get('b'));
  if (b >= MIN_BUDGET && b <= MAX_BUDGET) state.budget = b;
  const ids = params.get('p')?.split(',');
  if (ids?.length === CATEGORIES.length) {
    const build = {};
    CATEGORIES.forEach((c, i) => {
      const part = catalog.byId.get(ids[i]);
      build[c] = part && part.category === c ? part : null;
    });
    if (build.cpu) state.build = build;
  }
}

// ---------- 3D stage ----------
function renderStageChips() {
  $('#stage-chips').innerHTML = CATEGORIES.map((c) =>
    `<button type="button" class="chip" data-cat="${c}">${SHORT_LABEL[c]}</button>`).join('');
  $('#stage-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) openSheet(b.dataset.cat, { from3d: true });
  });
}

// The 3D (three.js ~1.3 MB + the model ~1.2 MB) waits until the page has painted, behind a still poster.
// On Save-Data or a slow connection it waits for the visitor to touch the PC instead.
function deferStage() {
  let started = false;
  const go = () => { if (!started) { started = true; mountStage(); } };
  const conn = navigator.connection;
  const slow = conn && (conn.saveData || /(^|-)2g|3g/.test(conn.effectiveType || ''));
  $('#stage').addEventListener('pointerdown', go, { once: true });
  if (slow) return;
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 600));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

async function mountStage() {
  const stage = $('#stage');
  try {
    stage.classList.add('is-loading');
    const { mountPC } = await import('./pc3d.js');
    pc3d = await mountPC(stage, { onPick: (cat) => openSheet(cat, { from3d: true }), onHover: peekPart, labels: SHORT_LABEL, reducedMotion });
    stage.classList.remove('is-loading');
    stage.classList.add('is-ready');
    // the tapping-hand cue shows until the visitor touches the PC once (remembered on this device)
    const touched = () => {
      stage.classList.add('is-touched');
      try { localStorage.setItem('rs-3d-touched', '1'); } catch { /* private mode */ }
    };
    try { if (localStorage.getItem('rs-3d-touched')) stage.classList.add('is-touched'); } catch { /* private mode */ }
    stage.addEventListener('pointerdown', touched, { once: true });
    window.__heroScroll?.remeasure();
  } catch (err) {
    console.warn('3D unavailable', err);
    stage.classList.remove('is-loading');
    stage.querySelector('canvas')?.remove();
    stage.querySelector('.hotspots')?.remove();
    stage.classList.add('is-fallback');
    stage.insertAdjacentHTML('beforeend', `<div class="stage-fallback">${CATEGORIES.map((c) =>
      `<button type="button" class="fallback-part" data-cat="${c}">${ICONS[c]}<span>${SHORT_LABEL[c]}</span></button>`).join('')}</div>`);
    stage.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (b) openSheet(b.dataset.cat, { from3d: true });
    });
  }
}

// ---------- full-screen viewer ----------
// Zooming into a part expands the 3D viewer to fill the screen; Isara / Esc brings it back to the hero.
const isFull = () => document.documentElement.classList.contains('viewer-full');

function enterFull() {
  if (isFull() || !pc3d) return;
  document.documentElement.classList.add('viewer-full');
  $('.stage-wrap').classList.add('is-full');
  hidePeek();
  $('#stage').style.cssText = '';
  pc3d.setWindow(null);
  pc3d.setFull(true);
}

function exitFull() {
  sheetOpenedFull = false;
  if (!isFull()) return;
  document.documentElement.classList.remove('viewer-full');
  $('.stage-wrap').classList.remove('is-full');
  hidePeek();
  pc3d?.setFull(false);
  window.__heroScroll?.remeasure();
  $('#viewer-expand')?.focus({ preventScroll: true });
}

function bindViewer() {
  $('#viewer-expand').addEventListener('click', enterFull);
  $('#viewer-close').addEventListener('click', exitFull);
  $('#viewer-zoomout').addEventListener('click', () => pc3d?.reset());
  // In full screen the wheel zooms; scrolling back out past the whole-PC view closes it.
  let outBudget = 0;
  $('#stage').addEventListener('wheel', (e) => {
    if (!pc3d || !isFull()) return;
    if (e.deltaY > 0 && pc3d.atHome()) {
      outBudget += e.deltaY;
      if (outBudget > 260) { outBudget = 0; exitFull(); }
    } else if (e.deltaY < 0) {
      outBudget = 0;
    }
  }, { passive: false });
  document.addEventListener('keydown', (e) => {
    // with a popup open, Esc closes the popup first; the next Esc leaves full screen
    if (e.key === 'Escape' && isFull() && !document.querySelector('dialog[open]')) exitFull();
  });
}

// ---------- hover a part of the 3D PC: the left column shows what it is + 3 picks ----------
// Mouse + two-column hero only. The card stays a moment after the pointer leaves the PC, so you can move
// over to it and click a product.
const PART_BLURB = {
  cpu: 'Ang utak ng PC. Siya ang nagpapatakbo ng lahat: games, apps, at Windows.',
  motherboard: 'Dito nakakabit ang lahat ng parts. Dapat tugma ang socket sa CPU at ang RAM type.',
  ram: 'Panandaliang memory. Mas marami, mas maraming sabay-sabay na bukas na apps at tabs.',
  gpu: 'Graphics card. Siya ang bida sa gaming at video editing: mas malakas, mas mataas na FPS.',
  ssd: 'Storage: dito naka-save ang Windows, games at files. NVMe ang pinakamabilis.',
  psu: 'Power supply. Nagbibigay ng kuryente sa lahat ng parts; huwag tipirin.',
  case: 'Ang katawan ng PC. Dapat kasya ang motherboard, GPU at cooler, at maganda ang airflow.',
  cooler: 'Pampalamig ng CPU. Mas malamig, mas tahimik at mas tumatagal ang PC.',
};
const peekMode = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 860px)');
const peekTwoCol = matchMedia('(min-width: 860px) and (min-aspect-ratio: 11/10)');
// zoomed into the PC (scrolled in, or full screen): the hero copy is gone, so the card floats over the 3D as glass
// the next section ("Saan tayo magsisimula?") has come up on screen: no card, at once
const peekPastPC = () => { const h = $('#start .section-head'); return !!h && h.getBoundingClientRect().top < innerHeight - 24; };
const peekFloating = () => $('.stage-wrap')?.classList.contains('is-full') || $('#hero')?.classList.contains('is-zooming');
// Timing, like a good mega-menu:
// - leave a part and the card waits PEEK_HIDE ms, then goes (quick, so it never lingers)
// - while the pointer is getting closer to the card, it stays open, and parts you cross on the way
//   do not swap it (a part only takes over once you rest on it for PEEK_SWAP ms)
// - on the card itself it stays until you leave it
const PEEK_HIDE = 350;
const PEEK_SWAP = 180;
let peekTimer = 0;
let swapTimer = 0;
let peekCat = null;
let peekSync = () => {};
let approaching = 0; // time of the last pointer move that brought it closer to the card

function peekPicks(cat) {
  const list = partsOf(cat).filter((p) => p.shopeeUrl);
  if (list.length <= 3) return list.map((p, i) => [['Budget', 'Sulit', 'Premium'][i], p]);
  return [['Budget', list[0]], ['Sulit', list[Math.floor((list.length - 1) / 2)]], ['Premium', list[list.length - 1]]];
}

function peekPart(cat) {
  const card = $('#peek');
  if (!card) return;
  clearTimeout(swapTimer);
  if (!cat) { peekLeave(); return; }
  if (!peekMode.matches || !catalog.parts.length || peekPastPC() || (!peekFloating() && !peekTwoCol.matches)) return;
  clearTimeout(peekTimer); peekTimer = 0;
  if (cat === peekCat && !card.hidden && card.classList.contains('peek-float') === !!peekFloating()) return;
  // heading for the open card: don't swap it for a part you are only passing over
  if (!card.hidden && performance.now() - approaching < 120) { swapTimer = setTimeout(() => peekPart(cat), PEEK_SWAP); return; }
  showPeek(card, cat);
}

function showPeek(card, cat) {
  peekCat = cat;
  const all = partsOf(cat);
  card.innerHTML = `
    <p class="peek-eyebrow"><span class="peek-icon">${ICONS[cat]}</span>Naka-hover</p>
    <h2 class="peek-title">${esc(CATEGORY_LABEL[cat])}</h2>
    <p class="peek-blurb">${PART_BLURB[cat] || ''}</p>
    <ul class="peek-list">${peekPicks(cat).map(([tier, p]) => `
      <li><a class="peek-item" href="${esc(p.shopeeUrl)}" target="_blank" rel="sponsored noopener" data-part="${esc(p.id)}" data-tip="Bubuksan sa Shopee (bagong tab)">
        <span class="peek-thumb">${thumb(p, cat)}</span>
        <span class="peek-body"><span class="peek-tier">${tier}</span><span class="peek-name">${esc(p.name)}</span></span>
        <strong class="peek-price">${peso.format(p.price)}</strong>
      </a></li>`).join('')}
    </ul>
    <button type="button" class="peek-all" data-peek-all="${cat}">Tingnan lahat ng ${all.length} ${esc(SHORT_LABEL[cat])} options →</button>`;
  const floating = !!peekFloating();
  const home = floating ? document.body : $('.hero-copy');
  if (card.parentElement !== home) home.append(card);
  card.classList.toggle('peek-float', floating);
  $('.hero-copy')?.classList.toggle('is-peek', !floating);
  card.hidden = false;
}

function peekLeave(ms = PEEK_HIDE) {
  clearTimeout(peekTimer);
  peekTimer = setTimeout(hidePeek, ms);
}

function hidePeek() {
  const card = $('#peek');
  if (!card) return;
  clearTimeout(peekTimer); clearTimeout(swapTimer);
  peekTimer = 0;
  peekCat = null;
  $('.hero-copy')?.classList.remove('is-peek');
  card.hidden = true;
}

function bindPeek() {
  const card = $('#peek');
  if (!card) return;
  const chips = $('#stage-chips');
  chips?.addEventListener('mouseover', (e) => { const b = e.target.closest('[data-cat]'); if (b) peekPart(b.dataset.cat); });
  chips?.addEventListener('mouseout', (e) => { if (e.target.closest('[data-cat]') && !e.relatedTarget?.closest?.('#stage-chips [data-cat]')) peekPart(null); });
  card.addEventListener('mouseenter', () => { clearTimeout(peekTimer); clearTimeout(swapTimer); peekTimer = 0; });
  card.addEventListener('mouseleave', () => peekLeave(250));
  // getting closer to the card keeps it open (restarts the hide countdown)
  let lastDist = Infinity;
  addEventListener('mousemove', (e) => {
    if (card.hidden || card.matches(':hover')) { lastDist = Infinity; return; }
    const r = card.getBoundingClientRect();
    const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
    const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d < lastDist - 0.5) { approaching = performance.now(); if (peekTimer) peekLeave(); }
    lastDist = d;
  }, { passive: true });
  card.addEventListener('click', (e) => {
    const all = e.target.closest('[data-peek-all]');
    if (all) { hidePeek(); openSheet(all.dataset.peekAll, { from3d: true }); }
  });
  // scrolling between "beside the PC" and "zoomed in" (or past the PC): don't leave the card in the wrong place.
  // Runs from the hero's own scroll frame (after it sets is-zooming), so it never reads a stale state.
  peekSync = () => {
    if (card.hidden) return;
    if (peekPastPC()) hidePeek();
    // started zooming (or back at the top): move the open card to the right place instead of losing it
    else if (card.classList.contains('peek-float') !== !!peekFloating()) showPeek(card, peekCat);
  };
  addEventListener('scroll', peekSync, { passive: true });
}

// ---------- scroll into the PC ----------
// The hero is a tall scroll track with a pinned screen. Scrolling down first grows the 3D stage from its
// slot to the whole screen and pushes the camera in, then the page carries on to the parts.
function bindHeroScroll() {
  const hero = $('#hero');
  const pin = $('.hero-pin');
  const slot = $('.stage-slot');
  const stage = $('#stage');
  const fade = [$('.hero-copy'), $('#stage-chips')];
  const cue = $('.scroll-cue');
  const next = $('#start');
  const cueBase = cue ? parseFloat(getComputedStyle(cue).bottom) || 14 : 14; // its resting distance from the bottom
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => t * t * (3 - 2 * t);
  let base = null;
  let queued = false;

  function measure() {
    const pr = pin.getBoundingClientRect();
    const sr = slot.getBoundingClientRect();
    base = { x: sr.left - pr.left, y: sr.top - pr.top, w: sr.width, h: sr.height, pinLeft: pr.left };
  }
  function update() {
    queued = false;
    if (isFull() || !base) return;
    // all layout reads first, then the writes below (no forced reflow mid-frame)
    const len = hero.offsetHeight - pin.offsetHeight;
    const p = len > 0 ? clamp(-hero.getBoundingClientRect().top / len) : 0;
    const nextTop = next ? next.getBoundingClientRect().top : 0;
    const headTop = next ? (next.querySelector('.section-head') || next).getBoundingClientRect().top : 0;
    const vh = innerHeight;
    // 0 → ZOOM_END: grow + push in. FADE_START → FADE_END: the PC fades out while the parts section
    // (pulled up over the end of the track in CSS) rises over it, so there is no hard cut.
    const ZOOM_END = 0.6;
    const FADE_START = 0.58;
    const FADE_END = 0.92;
    const k = ease(clamp(p / ZOOM_END));
    const fadeOut = ease(clamp((p - FADE_START) / (FADE_END - FADE_START)));
    const W = document.documentElement.clientWidth;
    const H = pin.offsetHeight;
    const lerp = (a, b) => a + (b - a) * k;
    // the stage always covers the whole pinned screen (fixed size: no canvas resize while scrolling);
    // a clip shows only the "window", which grows from the slot to the full screen
    const win = { x: lerp(base.x + base.pinLeft, 0), y: lerp(base.y, 0), w: lerp(base.w, W), h: lerp(base.h, H) };
    Object.assign(stage.style, {
      left: `${-base.pinLeft}px`, top: '0px', width: `${W}px`, height: `${H}px`,
      clipPath: `inset(${win.y.toFixed(1)}px ${(W - win.x - win.w).toFixed(1)}px ${(H - win.y - win.h).toFixed(1)}px ${win.x.toFixed(1)}px)`,
    });
    stage.style.setProperty('--wx', `${win.x}px`);
    stage.style.setProperty('--wy', `${win.y}px`);
    stage.style.setProperty('--ww', `${win.w}px`);
    stage.style.setProperty('--wh', `${win.h}px`);
    pc3d?.setWindow(win);
    const o = clamp(1 - p * 2.2);
    for (const el of fade) {
      el.style.opacity = o;
      el.style.transform = `translateY(${(-p * 36).toFixed(1)}px)`;
      el.style.pointerEvents = o < 0.3 ? 'none' : '';
    }
    stage.style.opacity = (1 - fadeOut).toFixed(3);
    stage.style.transform = fadeOut ? `scale(${(1 + fadeOut * 0.06).toFixed(4)})` : '';
    stage.style.pointerEvents = fadeOut > 0.6 ? 'none' : '';
    hero.classList.toggle('is-deep', k > 0.5);
    hero.classList.toggle('is-zooming', p > 0.01); // the PC has started to grow over the hero copy
    peekSync();
    // "Mag-scroll pababa" stays until the next section (the page cards) is fully on screen, then fades
    if (cue && next) {
      const top = nextTop;
      // ride just above the incoming heading instead of sitting on top of it
      const lift = vh - headTop + 14;
      cue.style.bottom = lift > cueBase ? `${lift.toFixed(1)}px` : '';
      const co = clamp((top - 70) / 180);
      cue.style.opacity = co.toFixed(3);
      cue.style.pointerEvents = co < 0.3 ? 'none' : '';
      // phones: the floating Basket waits until the cue is gone (they share the bottom of the screen;
      // the nav has a Basket button too)
      document.documentElement.classList.toggle('in-hero', co > 0.05);
    }
    pc3d?.setScrollZoom(k);
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  const remeasure = () => { measure(); update(); };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', remeasure);
  new ResizeObserver(remeasure).observe(slot);
  window.__heroScroll = { remeasure };
  remeasure();
}

// ---------- product popup ----------
let sheetCat = null;
let sheetOpenedFull = false; // full screen was opened by the product list, not by the visitor

// Filters shown above the product list, per category. A getter may return several values (a case fits
// several board sizes). A filter only shows when the category has 2+ different values for it.
const SIZE_LABEL = { ATX: 'ATX', mATX: 'Micro-ATX', ITX: 'Mini-ITX' };
const gb = (n) => (n >= 1000 ? `${n / 1000}TB` : `${n}GB`);
const SHEET_FILTERS = {
  cpu: [['Brand', (p) => p.brand], ['Socket', (p) => p.socket]],
  motherboard: [['Socket', (p) => p.socket], ['Laki', (p) => SIZE_LABEL[p.formFactor]], ['RAM', (p) => p.memType]],
  ram: [['Type', (p) => p.memType], ['Laki', (p) => gb(p.capacityGB)]],
  gpu: [['Brand', (p) => gpuVendor(p)], ['VRAM', (p) => `${p.vramGB}GB`]],
  ssd: [['Type', (p) => p.interface], ['Laki', (p) => gb(p.capacityGB)]],
  psu: [['Watts', (p) => `${p.watts}W`], ['Rating', (p) => p.rating]],
  case: [['Kasya ang board', (p) => (p.formFactors || []).map((f) => SIZE_LABEL[f])]],
  cooler: [['Type', (p) => (p.stock ? null : p.type === 'aio' ? 'AIO (liquid)' : 'Air')]],
};
const sheetFilters = {}; // { cat: { label: value } } remembered while the page is open
let sheetFrom3d = false;

const asList = (v) => (Array.isArray(v) ? v : [v]).filter((x) => x != null && x !== '');
const sizeOf = (v) => (parseFloat(v) || 0) * (/TB$/.test(v) ? 1000 : 1); // 480GB < 1TB
const naturalSort = (a, b) => sizeOf(a) - sizeOf(b) || String(a).localeCompare(String(b));

// The helpers below work on any list of parts (`base`) and any set of choices (`chosen`), so the
// product sheet and the "May Parts na Ako" results share one filter engine.
function filterDefs(cat, list) {
  return (SHEET_FILTERS[cat] || [])
    .map(([label, get]) => ({ label, get, values: [...new Set(list.flatMap((p) => asList(get(p))))].sort(naturalSort) }))
    .filter((f) => f.values.length > 1);
}

// parts that pass the chosen filters; `upTo` = only the first N filters (rows above a given row)
function applyFilters(cat, base, chosen, upTo = Infinity) {
  const defs = filterDefs(cat, base);
  return base.filter((p) => defs.every((f, i) =>
    i >= upTo || !chosen[f.label] || asList(f.get(p)).includes(chosen[f.label])));
}

// Rows narrow the rows below them: Brand AMD → Socket shows only AM4/AM5. A row never hides its own
// options, so switching AMD → Intel is one tap.
function filterOptions(cat, base, chosen, f) {
  const idx = filterDefs(cat, base).findIndex((x) => x.label === f.label);
  return [...new Set(applyFilters(cat, base, chosen, idx).flatMap((p) => asList(f.get(p))))].sort(naturalSort);
}

// after a choice, clear choices further down that no longer have a matching part
function pruneChosen(cat, base, chosen) {
  for (const f of filterDefs(cat, base)) {
    if (chosen[f.label] && !filterOptions(cat, base, chosen, f).includes(chosen[f.label])) delete chosen[f.label];
  }
}

// chip rows; `extra` adds data attributes so each place can tell its own clicks apart
function filterRowsHtml(cat, base, chosen, extra = '') {
  return filterDefs(cat, base).map((f) => `
    <div class="sf-row" role="radiogroup" aria-label="${esc(f.label)}">
      <span class="sf-label">${esc(f.label)}</span>
      <div class="sf-chips">${['', ...filterOptions(cat, base, chosen, f)].map((v) => {
        const on = (chosen[f.label] || '') === v;
        return `<button type="button" role="radio" aria-checked="${on}" class="chip sf-chip${on ? ' active' : ''}"${extra} data-filter="${esc(f.label)}" data-value="${esc(v)}">${v ? esc(v) : 'Lahat'}</button>`;
      }).join('')}</div>
    </div>`).join('');
}

const filteredParts = (cat) => applyFilters(cat, partsOf(cat), sheetFilters[cat] || {});
const pruneFilters = (cat) => pruneChosen(cat, partsOf(cat), sheetFilters[cat] || {});
function renderSheetFilters(cat) {
  $('#sheet-filters').innerHTML = filterRowsHtml(cat, partsOf(cat), sheetFilters[cat] || {});
}

function renderSheetList(cat) {
  const all = partsOf(cat);
  const list = filteredParts(cat);
  const inBuild = state.build?.[cat];
  const filtered = list.length !== all.length;
  $('#sheet-sub').textContent = `${filtered ? `${list.length} sa ${all.length}` : list.length} options · mula ${peso.format(list[0]?.price || 0)}`;
  if (!list.length) {
    $('#sheet-list').innerHTML = '<p class="bk-empty">Walang tugma sa filter. Pindutin ang <strong>Lahat</strong> para makita ulit lahat.</p>';
    return;
  }
  $('#sheet-list').innerHTML = list.map((p) => {
    const chosen = inBuild?.id === p.id;
    let badge = '';
    let action = '';
    if (state.build) {
      const bad = checkBuild({ ...state.build, [cat]: p }).some((r) => r.level === 'fail');
      if (chosen) badge = '<span class="badge badge-ok">Nasa build mo</span>';
      else if (bad) badge = '<span class="badge badge-bad">Hindi compatible sa build mo</span>';
      if (!chosen) action = `<button type="button" class="btn btn-glass btn-sm" data-use="${p.id}">Gamitin sa build</button>`;
    }
    return `
      <article class="prod${chosen ? ' is-chosen' : ''}">
        <div class="prod-thumb">${thumb(p, cat)}</div>
        <div class="prod-body">
          ${badge}
          <h3 class="prod-name">${esc(p.name)}</h3>
          <p class="prod-spec">${esc(specLine(p))}</p>
          <p class="prod-note">${esc(p.note)}</p>
          <div class="prod-foot">
            <strong class="prod-price">${peso.format(p.price)}</strong>
            <div class="prod-actions">${action}${basketButton(p.id)}${shopButton(p)}</div>
          </div>
        </div>
      </article>`;
  }).join('');
}

/**
 * @param {string} cat
 * @param {{from3d?: boolean, refresh?: boolean}} opts from3d: opened from the 3D PC (zoom to the part,
 *   full-screen viewer behind the list). refresh: re-render the open list, keep where it came from.
 */
function openSheet(cat, opts = {}) {
  if (!catalog.parts.length) return;
  if (!opts.refresh) sheetFrom3d = !!opts.from3d;
  sheetCat = cat;
  $('#sheet-icon').innerHTML = ICONS[cat];
  $('#sheet-title').textContent = CATEGORY_LABEL[cat];
  $('#sheet-date').textContent = catalog.meta.priceChecked;

  const note = $('#sheet-note');
  const inBuild = state.build?.[cat];
  note.hidden = true;
  if (state.build && cat === 'cooler' && inBuild?.stock) {
    note.hidden = false;
    note.textContent = 'Stock cooler (kasama sa CPU) ang gamit ng build mo. Pwede kang mag-upgrade dito.';
  } else if (state.build && cat === 'gpu' && !inBuild) {
    note.hidden = false;
    note.textContent = 'Walang GPU ang build mo ngayon (built-in graphics ng CPU ang gamit).';
  } else if (!state.build) {
    note.hidden = false;
    note.innerHTML = `Tip: gamitin ang <a href="${ROOT}build/">Mag-Build</a> para i-check ang compatibility ng buong set.`;
  }

  renderSheetFilters(cat);
  renderSheetList(cat);
  const next = CATEGORIES[CATEGORIES.indexOf(cat) + 1];
  $('#sheet-next-label').textContent = next ? `Susunod: ${SHORT_LABEL[next]}` : 'Tingnan ang Basket';
  $('#sheet-next').setAttribute('aria-label', next ? `Susunod na category: ${SHORT_LABEL[next]}` : 'Tingnan ang Basket');
  $('#sheet-next').dataset.next = next || '';

  const dlg = $('#sheet');
  if (!dlg.open) dlg.showModal();
  if (!opts.refresh) dlg.querySelector('.sheet-inner').scrollTop = 0;
  if (!sheetFrom3d) return; // part cards, the builder and sample builds leave the 3D PC alone
  pc3d?.focus(cat);
  // the zoomed part fills the screen behind the list; closing the list goes back (see bindSheet)
  if (!isFull()) { enterFull(); sheetOpenedFull = true; }
}

function closeSheet() {
  const dlg = $('#sheet');
  if (dlg.open) dlg.close();
}

function bindSheet() {
  const dlg = $('#sheet');
  $('#sheet-close').addEventListener('click', closeSheet);
  // walk the categories in build order; after the last one, open the basket
  $('#sheet-next').addEventListener('click', (e) => {
    const next = e.currentTarget.dataset.next;
    if (next) openSheet(next, { from3d: sheetFrom3d });
    else { closeSheet(); openBasket(); }
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) closeSheet();
    if (e.target.closest('[data-close]')) closeSheet();
    const add = e.target.closest('[data-add]');
    if (add) addToBasket([add.dataset.add]);
    const f = e.target.closest('[data-filter]');
    if (f) {
      sheetFilters[sheetCat] = { ...(sheetFilters[sheetCat] || {}), [f.dataset.filter]: f.dataset.value };
      pruneFilters(sheetCat);
      renderSheetFilters(sheetCat);
      renderSheetList(sheetCat);
      return;
    }
    const use = e.target.closest('[data-use]');
    if (use && state.build) {
      state.build[sheetCat] = catalog.byId.get(use.dataset.use);
      renderResult(false);
      openSheet(sheetCat, { refresh: true });
      toast(`Napalitan ang ${SHORT_LABEL[sheetCat]} sa build mo.`);
    }
  });
  // in full screen the camera stays on the part after the popup closes; Zoom out / Isara go back
  // closing the list always zooms back out to the whole PC
  dlg.addEventListener('close', () => {
    if (sheetOpenedFull) { sheetOpenedFull = false; exitFull(); } // exitFull resets the camera too
    else if (sheetFrom3d) pc3d?.reset();
    sheetFrom3d = false;
  });
}

// ---------- category cards ----------
function renderCategoryCards() {
  $('#cat-cards').innerHTML = CATEGORIES.map((c) => {
    const list = partsOf(c);
    const pick = list[Math.floor(list.length / 2)] || list[0];
    return `
      <button type="button" class="cat-card" data-cat="${c}">
        <span class="cat-thumb">${thumb(pick, c)}</span>
        <span class="cat-name">${CATEGORY_LABEL[c]}</span>
        <span class="cat-from">${list.length} options · mula ${peso.format(list[0]?.price || 0)}</span>
      </button>`;
  }).join('');
  $('#cat-cards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) openSheet(b.dataset.cat);
  });
}

// ---------- builder form ----------
function renderForm() {
  $('#budget').value = state.budget;
  setBudgetText();
  $('#budget-chips').innerHTML = BUDGET_PRESETS.map((v) =>
    `<button type="button" class="chip${v === state.budget ? ' active' : ''}" data-budget="${v}">₱${v / 1000}K</button>`).join('');
  $('#usecase').innerHTML = Object.entries(USE_CASES).map(([key, u]) => `
    <button type="button" role="radio" aria-checked="${key === state.useCase}" class="segment${key === state.useCase ? ' active' : ''}" data-usecase="${key}">
      <span class="seg-title">${u.short || u.label}</span>
      <span class="seg-hint">${u.hint}</span>
    </button>`).join('');
  const set = Object.entries(state.prefs).filter(([, v]) => v !== 'any');
  const more = $('#more-prefs');
  if (more && set.length) more.open = true;
  const note = $('#prefs-note');
  if (note) note.textContent = set.length ? `${set.length} napili` : '';
  const avail = availablePrefs(catalog.parts);
  $('#prefs').innerHTML = Object.entries(PREFS).map(([key, def]) => `
    <div class="pref-row" role="radiogroup" aria-label="${def.label}">
      <span class="pref-label">${def.label}</span>
      <div class="pref-chips">${def.options.map(([v, label]) => {
        const ok = avail[key][v];
        const on = state.prefs[key] === v;
        return `<button type="button" role="radio" aria-checked="${on}" class="chip pref-chip${on ? ' active' : ''}" data-pref="${key}" data-value="${v}"${ok ? '' : ' disabled title="Wala pa sa listahan namin"'}>${label}${ok ? '' : ' <small>(wala pa)</small>'}</button>`;
      }).join('')}</div>
    </div>`).join('');
}

// Live build: every change rebuilds the suggestion right away, without scrolling the page.
// While the budget slider is dragged it rebuilds about every 90 ms (so the list follows the thumb), plus once at the end.
let liveTimer;
let lastLive = 0;
function runLive() {
  lastLive = performance.now();
  const r = suggestBuild(catalog.parts, state.budget, state.useCase, state.prefs);
  if (r.error) { state.build = null; showError(r, false); return; }
  state.build = r.build;
  renderResult(false);
}
function liveBuild(throttle = 0) {
  clearTimeout(liveTimer);
  const wait = throttle - (performance.now() - lastLive);
  if (wait <= 0) runLive();
  else liveTimer = setTimeout(runLive, wait);
}

// The budget amount is also a text box: type any amount (₱, commas, "60k" all work).
function setBudgetText() {
  const el = $('#budget-out');
  if (el && document.activeElement !== el) el.value = peso.format(state.budget);
}
function parseBudget(text) {
  const t = String(text).toLowerCase().replace(/[₱,\s]/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1));
}

function bindForm() {
  $('#budget').addEventListener('input', (e) => {
    state.budget = Number(e.target.value);
    setBudgetText();
    document.querySelectorAll('#budget-chips .chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.budget) === state.budget));
    liveBuild(90);
  });
  const out = $('#budget-out');
  const commit = () => {
    const v = parseBudget(out.value);
    if (v == null) { setBudgetText(); return; }
    state.budget = Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, Math.round(v / 1000) * 1000));
    if (v < MIN_BUDGET || v > MAX_BUDGET) toast(`Budget: ₱${MIN_BUDGET / 1000}K hanggang ₱${MAX_BUDGET / 1000}K`);
    out.blur();
    renderForm();
    liveBuild();
  };
  out.addEventListener('focus', () => { out.value = String(state.budget); out.select(); });
  out.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') out.blur();
  });
  out.addEventListener('blur', () => {
    const v = parseBudget(out.value);
    if (v != null && v !== state.budget) commit();
    else setBudgetText();
  });
  $('#budget-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-budget]');
    if (!chip) return;
    state.budget = Number(chip.dataset.budget);
    renderForm();
    liveBuild();
  });
  $('#usecase').addEventListener('click', (e) => {
    const seg = e.target.closest('[data-usecase]');
    if (!seg) return;
    state.useCase = seg.dataset.usecase;
    renderForm();
    liveBuild();
  });
  $('#prefs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref]');
    if (!b || b.disabled) return;
    state.prefs[b.dataset.pref] = b.dataset.value;
    renderForm();
    liveBuild();
  });
  $('#basket-build-btn').addEventListener('click', () => {
    if (state.build) addToBasket(CATEGORIES.map((c) => state.build[c]?.id).filter(Boolean));
  });
  $('#share-btn').addEventListener('click', async () => {
    writeHash();
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Nakopya ang link! I-send sa tropa mo.');
    } catch {
      toast('Kopyahin ang link sa address bar.');
    }
  });
}

function showError(r, scroll = true) {
  const result = $('#result');
  result.hidden = false;
  // no build to add, share or check
  $('.summary-actions').hidden = true;
  $('.compat').hidden = true;
  if (r.noMatch) {
    $('#summary-label').textContent = 'Walang tugmang build';
    $('#total').textContent = '—';
    $('#usecase-tag').textContent = USE_CASES[state.useCase].label;
    $('#meter-fill').style.width = '0%';
    $('#budget-note').textContent = noMatchHint();
    $('#compat-list').innerHTML = '';
    $('#parts-list').innerHTML = '';
    $('#price-note').textContent = '';
    if (scroll) result.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  $('#summary-label').textContent = 'Kulang ang budget';
  $('#total').textContent = peso.format(r.minBudget);
  $('#usecase-tag').textContent = USE_CASES[state.useCase].label;
  $('#meter-fill').style.width = '100%';
  $('#meter-fill').classList.add('over');
  $('#budget-note').textContent = `Para sa ${USE_CASES[state.useCase].label}${prefsText()}, mga ${peso.format(r.minBudget)} ang pinakamababang kumpletong build sa listahan namin ngayon. Subukan ang mas mataas na budget o ibang napili.`;
  $('#compat-list').innerHTML = '';
  $('#parts-list').innerHTML = '';
  $('#price-note').textContent = '';
  if (scroll) result.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function prefLabel(key) {
  return PREFS[key].options.find(([v]) => v === state.prefs[key])?.[1] || '';
}

function prefsText() {
  const picked = Object.keys(PREFS).filter((k) => state.prefs[k] !== 'any').map(prefLabel);
  return picked.length ? ` (${picked.join(', ')})` : '';
}

function noMatchHint() {
  const { cpuBrand, gpuBrand, formFactor } = state.prefs;
  if (state.useCase === 'school' && gpuBrand !== 'any') {
    return 'Para sa School / Office, built-in graphics o maliit na GPU lang ang kasya sa listahan. Gawing "Kahit ano" ang GPU brand.';
  }
  if (formFactor !== 'any' && cpuBrand !== 'any') {
    return `Wala pa kaming ${prefLabel('formFactor')} na motherboard para sa ${prefLabel('cpuBrand')} sa listahan. Subukan ang ibang laki o ibang CPU brand.`;
  }
  return 'Walang parts sa listahan na tugma sa lahat ng napili mo. Gawing "Kahit ano" ang isa sa kanila.';
}

// ---------- result ----------
function optionLabel(cat, p) {
  const bad = checkBuild({ ...state.build, [cat]: p }).some((r) => r.level === 'fail');
  const name = p ? p.name : 'Walang GPU (built-in graphics)';
  const price = p ? ` · ${peso.format(p.price)}` : '';
  return `${bad ? '⚠ ' : ''}${name}${price}${bad ? ' (hindi compatible)' : ''}`;
}

// Only rows whose part changed are rebuilt (the rest stay put, images and all), and those get a short swap
// animation. Cheap: at most 8 small elements, transform + opacity only.
function renderParts() {
  const list = $('#parts-list');
  const rows = CATEGORIES.map((cat) => partRow(cat));
  const old = [...list.children];
  if (old.length !== rows.length) {
    list.innerHTML = rows.map((r) => r.html).join('');
    return;
  }
  rows.forEach((r, i) => {
    if (old[i].dataset.part === r.id) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = r.html.trim();
    const li = tpl.content.firstElementChild;
    if (!reducedMotion) li.classList.add('is-swapped');
    old[i].replaceWith(li);
  });
}

function partRow(cat) {
  return { id: state.build[cat]?.id || '-', html: partHtml(cat) };
}

function partHtml(cat) {
  {
    const p = state.build[cat];
    const all = cat === 'gpu' ? [null, ...partsOf(cat)] : catalog.parts.filter((x) => x.category === cat).sort((a, b) => a.price - b.price);
    const options = all.map((o) => `<option value="${o ? o.id : '-'}"${(o?.id || '-') === (p?.id || '-') ? ' selected' : ''}>${esc(optionLabel(cat, o))}</option>`).join('');
    return `
      <li class="card part" data-category="${cat}" data-part="${p?.id || '-'}">
        <button type="button" class="part-thumb" data-sheet="${cat}" aria-label="Tingnan ang ${CATEGORY_LABEL[cat]} options">${thumb(p, cat)}</button>
        <div class="part-body">
          <p class="part-cat">${CATEGORY_LABEL[cat]}</p>
          <p class="part-name">${esc(p ? p.name : 'Walang GPU')}</p>
          <p class="part-spec">${esc(p ? specLine(p) : 'Gagamitin ang built-in graphics ng CPU.')}</p>
          <label class="swap"><span class="sr-only">Palitan ang ${CATEGORY_LABEL[cat]}</span>
            <select data-swap="${cat}"><option disabled>Palitan…</option>${options}</select>
          </label>
        </div>
        <div class="part-side">
          <p class="part-price">${p ? (p.price ? peso.format(p.price) : 'Libre') : '₱0'}</p>
          ${shopButton(p, 'btn-shop-quiet', 'Shopee <span aria-hidden="true">›</span>')}
        </div>
      </li>`;
  }
}

function bindParts() {
  $('#parts-list').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-swap]');
    if (!sel) return;
    state.build[sel.dataset.swap] = sel.value === '-' ? null : catalog.byId.get(sel.value);
    renderResult(false);
  });
  $('#parts-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sheet]');
    if (b) openSheet(b.dataset.sheet);
  });
}

function renderCompat() {
  const results = checkBuild(state.build);
  const order = { fail: 0, warn: 1, ok: 2 };
  results.sort((a, b) => order[a.level] - order[b.level]);
  const icon = { ok: '✓', warn: '!', fail: '✕' };
  $('#compat-list').innerHTML = results.map((r) =>
    `<li class="compat-${r.level}"><span class="dot" aria-hidden="true">${icon[r.level]}</span><span>${esc(r.text)}</span></li>`).join('');
  const fails = results.filter((r) => r.level === 'fail').length;
  const warns = results.filter((r) => r.level === 'warn').length;
  const worst = fails ? 'fail' : warns ? 'warn' : 'ok';
  const sum = $('#compat-sum');
  if (sum) {
    sum.textContent = fails ? `${fails} problema sa compatibility` : warns ? `Compatible, may ${warns} paalala` : `Compatible lahat · ${results.length} checks`;
    $('#compat-dot').textContent = icon[worst];
    sum.closest('.compat').className = `tile compat compat-${worst}`;
    if (fails) sum.closest('.compat').open = true;
  }
  return results;
}

// the total rolls to its new value (~220 ms) instead of jumping
function countTo(el, to) {
  const from = Number(el.dataset.value || to);
  el.dataset.value = to;
  cancelAnimationFrame(el._raf);
  if (reducedMotion || from === to) { el.textContent = peso.format(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 220);
    el.textContent = peso.format(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function renderResult(scroll) {
  $('.summary-actions').hidden = false;
  $('.compat').hidden = false;
  const result = $('#result');
  result.hidden = false;
  const total = totalPrice(state.build);
  const fails = renderCompat().filter((r) => r.level === 'fail').length;
  $('#summary-label').textContent = fails ? `Total · ${fails} problema sa compatibility` : 'Total';
  countTo($('#total'), total);
  $('#usecase-tag').textContent = USE_CASES[state.useCase].label;
  const fill = $('#meter-fill');
  fill.style.width = `${Math.min(100, (total / state.budget) * 100)}%`;
  fill.classList.toggle('over', total > state.budget);
  const diff = state.budget - total;
  $('#budget-note').textContent = diff >= 0
    ? `${peso.format(diff)} ang tira sa ${peso.format(state.budget)} na budget · ~${estimateLoad(state.build)}W ang tantiyang load.`
    : `Lampas ng ${peso.format(-diff)} sa ${peso.format(state.budget)} na budget.`;
  renderParts();
  $('#price-note').textContent = `Presyo ng Shopee Mall listing noong ${catalog.meta.priceChecked}. Nagbabago ang presyo, i-check sa Shopee bago bumili.`;
  writeHash();
  if (scroll) result.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

// ---------- ready builds ----------
function renderSamples(builds) {
  $('#samples').innerHTML = builds.map((b) => {
    const parts = Object.fromEntries(CATEGORIES.map((c) => [c, catalog.byId.get(b.parts[c]) || null]));
    const pills = [
      ['cpu', parts.cpu?.name.replace(/^(AMD|Intel) /, '').replace(/ \(.*\)$/, '')],
      ['gpu', parts.gpu ? parts.gpu.name.replace(/^(MSI|ASUS|Sapphire|Gigabyte) /, '').replace(/ (Ventus|Shadow|Dual|Pulse|Gaming).*$/, '') : 'Built-in graphics'],
      ['ram', parts.ram ? `${parts.ram.capacityGB}GB ${parts.ram.memType}` : ''],
      ['ssd', parts.ssd ? `${capacity(parts.ssd.capacityGB)} ${parts.ssd.interface}` : ''],
    ].filter(([, t]) => t);
    return `
      <article class="sample">
        <div class="sample-main">
          <span class="tag tag-sm">${USE_CASES[b.useCase].label}</span>
          <h3>${esc(b.title)}</h3>
          <p class="small muted">${esc(b.blurb)}</p>
        </div>
        <div class="sample-thumbs" aria-hidden="true">${['cpu', parts.gpu ? 'gpu' : 'motherboard', 'ram', 'case'].map((c) => `<span class="sample-thumb">${thumb(parts[c], c)}</span>`).join('')}</div>
        <ul class="spec-pills">${pills.map(([c, t]) => `<li><span class="pill-icon">${ICONS[c]}</span>${esc(t)}</li>`).join('')}</ul>
        <div class="sample-foot">
          <strong>${peso.format(totalPrice(parts))}</strong>
          <div class="sample-btns">
            <button type="button" class="btn btn-glass btn-sm btn-basket" data-add-sample="${b.id}">${BASKET_ADD_ICON}<span>Basket</span></button>
            <button type="button" class="btn btn-blue btn-sm" data-sample="${b.id}">Tingnan</button>
          </div>
        </div>
      </article>`;
  }).join('');

  $('#samples').addEventListener('click', (e) => {
    const addAll = e.target.closest('[data-add-sample]');
    if (addAll) {
      const sb = builds.find((x) => x.id === addAll.dataset.addSample);
      addToBasket(CATEGORIES.map((c) => sb.parts[c]).filter(Boolean));
      return;
    }
    const btn = e.target.closest('[data-sample]');
    if (!btn) return;
    const b = builds.find((x) => x.id === btn.dataset.sample);
    const build = Object.fromEntries(CATEGORIES.map((c) => [c, catalog.byId.get(b.parts[c]) || null]));
    const budget = Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, Math.ceil(totalPrice(build) / 1000) * 1000));
    // open it on the Mag-Build page, where it can be changed part by part and shared
    location.href = `${ROOT}build/${buildHash(build, b.useCase, budget)}`;
  });
}

// ---------- may parts na ako ----------
const OWNED_LABEL = { cpu: 'CPU', motherboard: 'Motherboard', ram: 'RAM', gpu: 'GPU', psu: 'Power supply' };
const mayExpanded = new Set();
const mayFilters = {}; // { cat: { label: value } }, cleared when the owned parts change

// Each "ano'ng meron ka?" field is a searchable picker: a button that opens a panel with a search box,
// quick chips (brand / socket / type) and the list. Native <select> cannot filter, and its arrow sat on the border.
const PICK_CHIPS = {
  cpu: ['Brand', (p) => p.brand],
  motherboard: ['Socket', (p) => p.socket],
  ram: ['Type', (p) => p.memType],
  gpu: ['Brand', (p) => gpuVendor(p)],
  psu: ['Watts', (p) => (p.watts >= 750 ? '750W+' : p.watts >= 600 ? '600–700W' : 'Hanggang 550W')],
};
const CHEVRON = '<svg class="may-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const pick = { cat: null, q: '', chip: '', active: 0 };

function renderMayForm() {
  $('#may-form').innerHTML = OWNED_CATS.map((cat) => {
    const cur = state.owned[cat];
    return `
      <div class="may-field${cur ? ' is-set' : ''}" data-field="${cat}">
        <span id="may-l-${cat}">${OWNED_LABEL[cat]}</span>
        <button type="button" class="may-select" data-pick="${cat}" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="may-l-${cat} may-v-${cat}">
          <span class="may-value" id="may-v-${cat}">${esc(cur ? cur.name : 'Wala pa')}</span>${CHEVRON}
        </button>
      </div>`;
  }).join('');
}

function pickOptions(cat) {
  const { common, catalog: inList } = ownedOptions(cat, catalog.parts);
  const [, chipOf] = PICK_CHIPS[cat] || [];
  const words = pick.q.toLowerCase().split(/\s+/).filter(Boolean);
  const keep = (p) => (!pick.chip || chipOf?.(p) === pick.chip) && words.every((w) => p.name.toLowerCase().includes(w));
  return { common: common.filter(keep), inList: inList.filter(keep), all: [...common, ...inList] };
}

function renderPickList() {
  const cat = pick.cat;
  const panel = $('#may-pick');
  if (!cat || !panel) return;
  const { common, inList } = pickOptions(cat);
  const cur = state.owned[cat]?.id || '';
  const flat = [{ id: '', name: 'Wala pa' }, ...common, ...inList];
  pick.active = Math.min(pick.active, flat.length - 1);
  let i = 0;
  const opt = (p) => {
    const idx = i++;
    return `<li role="option" id="may-o-${idx}" class="may-opt${idx === pick.active ? ' is-active' : ''}" aria-selected="${p.id === cur}" data-choose="${esc(p.id)}">${esc(p.name)}${p.price ? `<small>${peso.format(p.price)}</small>` : ''}</li>`;
  };
  const group = (label, list) => (list.length ? `<li class="may-group" role="presentation">${label}</li>${list.map(opt).join('')}` : '');
  panel.querySelector('.may-list').innerHTML = opt(flat[0])
    + group('Karaniwang meron na', common)
    + group('Nasa listahan namin', inList)
    + (common.length + inList.length ? '' : '<li class="may-none" role="presentation">Walang tugma. Subukan ang ibang salita.</li>');
  panel.querySelector('.may-list').setAttribute('aria-activedescendant', `may-o-${pick.active}`);
  panel.querySelectorAll('[data-pchip]').forEach((b) => {
    const on = b.dataset.pchip === pick.chip;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  });
  panel.querySelector('.may-opt.is-active')?.scrollIntoView({ block: 'nearest' });
}

function openPick(cat) {
  closePick();
  pick.cat = cat;
  pick.q = '';
  pick.chip = '';
  pick.active = 0;
  const field = document.querySelector(`[data-field="${cat}"]`);
  const btn = field.querySelector('.may-select');
  const [chipLabel, chipOf] = PICK_CHIPS[cat] || [];
  const chips = chipOf ? [...new Set(pickOptions(cat).all.map(chipOf).filter(Boolean))].sort() : [];
  field.insertAdjacentHTML('beforeend', `
    <div class="may-pick" id="may-pick">
      <input type="search" class="may-search" placeholder="Hanapin ang ${esc(OWNED_LABEL[cat])}…" aria-label="Hanapin" autocomplete="off">
      ${chips.length > 1 ? `<div class="may-chips" role="group" aria-label="${esc(chipLabel)}">
        <button type="button" class="chip sf-chip" data-pchip="">Lahat</button>
        ${chips.map((c) => `<button type="button" class="chip sf-chip" data-pchip="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>` : ''}
      <ul class="may-list" role="listbox" aria-label="${esc(OWNED_LABEL[cat])}"></ul>
    </div>`);
  btn.setAttribute('aria-expanded', 'true');
  field.classList.add('is-open');
  renderPickList();
  // phones: no auto-focus, so the keyboard does not cover the list until the visitor taps search
  if (window.matchMedia('(pointer: fine)').matches) $('#may-pick .may-search').focus();
}

function closePick(focusBack = false) {
  const panel = $('#may-pick');
  if (!panel) return;
  const field = panel.closest('.may-field');
  panel.remove();
  field.classList.remove('is-open');
  const btn = field.querySelector('.may-select');
  btn.setAttribute('aria-expanded', 'false');
  if (focusBack) btn.focus();
  pick.cat = null;
}

function setOwned(cat, id) {
  const part = id ? decodeOwned(id, catalog.byId)[cat] : null;
  if (part) state.owned[cat] = part;
  else delete state.owned[cat];
  mayExpanded.clear();
  for (const k of Object.keys(mayFilters)) delete mayFilters[k];
  writeMayHash();
  renderMayForm();
  renderMayResult();
}

function mayCard(p) {
  return `
    <article class="prod">
      <div class="prod-thumb">${thumb(p, p.category)}</div>
      <div class="prod-body">
        <h4 class="prod-name">${esc(p.name)}</h4>
        <p class="prod-spec">${esc(specLine(p))}</p>
        <p class="prod-note">${esc(p.note)}</p>
        <div class="prod-foot">
          <strong class="prod-price">${peso.format(p.price)}</strong>
          <div class="prod-actions">${basketButton(p.id)}${shopButton(p)}</div>
        </div>
      </div>
    </article>`;
}

// One compact row per missing category (its best match), so everything fits on one screen.
// "N swak ›" opens that category in place with filters and every option.
function renderMayResult() {
  const box = $('#may-result');
  if (!Object.keys(state.owned).length) {
    box.innerHTML = '<p class="may-empty small">Pumili ng kahit isang part sa kaliwa (o sa taas sa phone) para makita ang swak.</p>';
    return;
  }
  const { notes, needs } = suggestForOwned(state.owned, catalog.parts, { limit: 3 });
  const icon = { ok: '✓', warn: '!', fail: '✕' };
  const order = { fail: 0, warn: 1, ok: 2 };
  notes.sort((a, b) => order[a.level] - order[b.level]);
  const fails = notes.filter((n) => n.level === 'fail').length;
  const warns = notes.filter((n) => n.level === 'warn').length;
  const worst = fails ? 'fail' : warns ? 'warn' : 'ok';
  const notesHtml = notes.length ? `
    <details class="tile compat compat-${worst} may-notes"${fails ? ' open' : ''}>
      <summary><span class="dot" aria-hidden="true">${icon[worst]}</span><span>${fails ? `${fails} problema sa parts mo` : warns ? `Swak, may ${warns} paalala` : 'Swak ang parts mo'}</span></summary>
      <ul class="compat-list">${notes.map((r) => `<li class="compat-${r.level}"><span class="dot" aria-hidden="true">${icon[r.level]}</span><span>${esc(r.text)}</span></li>`).join('')}</ul>
    </details>` : '';
  const rows = needs.map((n) => {
    const base = partsOf(n.cat).filter((p) => fits(state.owned, n.cat, p));
    const chosen = mayFilters[n.cat] || {};
    const filtering = Object.values(chosen).some(Boolean);
    const open = mayExpanded.has(n.cat) || filtering;
    if (!open) {
      const p = n.picks[0];
      if (!p) {
        return `<div class="may-row is-empty" data-need="${n.cat}"><span class="may-row-thumb">${thumb(null, n.cat)}</span><span class="may-row-body"><span class="part-cat">${CATEGORY_LABEL[n.cat]}</span><span class="may-row-empty">${esc(n.empty || 'Walang swak')}</span></span></div>`;
      }
      return `
        <div class="may-row" data-need="${n.cat}">
          <button type="button" class="may-row-thumb" data-pop="${n.cat}" aria-haspopup="dialog" aria-label="Tingnan lahat ng swak na ${CATEGORY_LABEL[n.cat]}">${thumb(p, n.cat)}</button>
          <span class="may-row-body">
            <span class="part-cat">${CATEGORY_LABEL[n.cat]}</span>
            <span class="may-row-name">${esc(p.name)}</span>
            ${n.total > 1 ? `<button type="button" class="may-row-more" data-pop="${n.cat}" aria-haspopup="dialog"><span class="lbl-long">Tingnan Lahat</span><span class="lbl-short">Lahat</span> (${n.total}) ›</button>` : ''}
          </span>
          <span class="may-row-side">
            <span class="may-row-price">${peso.format(p.price)}</span>
            ${shopButton(p, 'btn-shop-quiet', 'Shopee <span aria-hidden="true">›</span>')}
          </span>
        </div>`;
    }
    const list = applyFilters(n.cat, base, chosen);
    return `
      <div class="tile may-need" data-need="${n.cat}">
        <div class="may-need-head">
          <h3>${CATEGORY_LABEL[n.cat]}</h3>
          <span class="small muted">${filtering ? `${list.length} sa ${n.total} swak` : `${n.total} swak`}</span>
          <button type="button" class="may-less" data-less="${n.cat}">Isara ✕</button>
        </div>
        ${n.hint ? `<p class="may-hint">${esc(n.hint)}</p>` : ''}
        ${n.total > 1 ? `<div class="sheet-filters may-filters">${filterRowsHtml(n.cat, base, chosen, ` data-mcat="${n.cat}"`)}</div>` : ''}
        ${list.length ? `<div class="prod-list">${list.map(mayCard).join('')}</div>`
          : '<p class="bk-empty">Walang tugma sa filter. Pindutin ang <strong>Lahat</strong>.</p>'}
      </div>`;
  }).join('');
  box.innerHTML = `${notesHtml}<div class="may-rows">${rows}</div>`;
}

// ---- "Tingnan Lahat" popover: every compatible option for one category, with filters ----
// Opens on hover (mouse) or tap/click; a floating card, not a new screen. One shared element.
const pop = { cat: null, anchor: null, openT: 0, closeT: 0, sticky: false }; // sticky = opened by a click: stays until closed
function popEl() {
  let el = $('#may-pop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'may-pop';
    el.className = 'may-pop';
    el.setAttribute('role', 'dialog');
    document.body.appendChild(el);
    el.addEventListener('mouseenter', () => clearTimeout(pop.closeT));
    el.addEventListener('mouseleave', () => { if (!pop.sticky) pop.closeT = setTimeout(closePop, 220); });
    el.addEventListener('click', (e) => {
      const f = e.target.closest('[data-pcat][data-filter]');
      if (f) {
        const cat = f.dataset.pcat;
        const chosen = (mayFilters[cat] ||= {});
        chosen[f.dataset.filter] = f.dataset.value;
        pruneChosen(cat, partsOf(cat).filter((p) => fits(state.owned, cat, p)), chosen);
        fillPop();
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) addToBasket([add.dataset.add]);
      if (e.target.closest('[data-pop-close]')) closePop();
    });
  }
  return el;
}
function fillPop() {
  const cat = pop.cat;
  const base = partsOf(cat).filter((p) => fits(state.owned, cat, p));
  const chosen = mayFilters[cat] || {};
  const list = applyFilters(cat, base, chosen);
  const el = popEl();
  el.setAttribute('aria-label', `Lahat ng swak na ${CATEGORY_LABEL[cat]}`);
  el.innerHTML = `
    <div class="pop-head">
      <strong>${CATEGORY_LABEL[cat]}</strong>
      <span class="small muted">${list.length === base.length ? `${base.length} swak` : `${list.length} sa ${base.length} swak`}</span>
      <button type="button" class="pop-close" data-pop-close aria-label="Isara">✕</button>
    </div>
    ${base.length > 1 ? `<div class="sheet-filters pop-filters">${filterRowsHtml(cat, base, chosen, ` data-pcat="${cat}"`)}</div>` : ''}
    <div class="pop-list">${list.length ? list.map((p) => `
      <div class="pop-item">
        <span class="pop-thumb">${thumb(p, cat)}</span>
        <span class="pop-body"><span class="pop-name">${esc(p.name)}</span><span class="pop-spec">${esc(specLine(p))}</span></span>
        <span class="pop-side">
          <span class="pop-price">${peso.format(p.price)}</span>
          <span class="pop-actions"><button type="button" class="pop-add" data-add="${esc(p.id)}" aria-label="Idagdag sa Basket">${BASKET_ADD_ICON}</button>${shopButton(p, 'btn-shop-quiet', 'Shopee <span aria-hidden="true">›</span>')}</span>
        </span>
      </div>`).join('') : '<p class="bk-empty">Walang tugma sa filter. Pindutin ang <strong>Lahat</strong>.</p>'}</div>`;
}
function placePop() {
  const el = popEl();
  if (matchMedia('(max-width: 639px)').matches || !pop.anchor) { el.style.cssText = ''; return; } // phones: CSS bottom card
  const r = pop.anchor.getBoundingClientRect();
  const w = Math.min(Math.max(r.width, 380), innerWidth - 24);
  const left = Math.min(Math.max(12, r.left), innerWidth - w - 12);
  const below = innerHeight - r.bottom - 12;
  const above = r.top - 64;
  const style = { left: `${left}px`, width: `${w}px`, top: '', bottom: '' };
  if (below >= 300 || below >= above) { style.top = `${r.bottom + 6}px`; style.maxHeight = `${Math.max(220, below - 6)}px`; }
  else { style.bottom = `${innerHeight - r.top + 6}px`; style.maxHeight = `${Math.max(220, above - 6)}px`; }
  Object.assign(el.style, style);
}
function openPop(cat, anchor, sticky = false) {
  clearTimeout(pop.closeT);
  clearTimeout(pop.openT);
  pop.sticky = sticky;
  pop.cat = cat;
  pop.anchor = anchor;
  fillPop();
  placePop();
  const el = popEl();
  requestAnimationFrame(() => el.classList.add('is-open'));
  document.querySelectorAll('.may-row.is-popped').forEach((x) => x.classList.remove('is-popped'));
  anchor?.classList.add('is-popped');
}
function closePop() {
  clearTimeout(pop.openT);
  const el = $('#may-pop');
  if (el) el.classList.remove('is-open');
  pop.anchor?.classList.remove('is-popped');
  pop.cat = null;
  pop.anchor = null;
  pop.sticky = false;
}

function writeMayHash() {
  const v = encodeOwned(state.owned);
  history.replaceState(null, '', v ? `#may=${v}` : location.pathname + location.search);
}

function bindMay() {
  const form = $('#may-form');
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick]');
    if (btn) {
      if (pick.cat === btn.dataset.pick) closePick();
      else openPick(btn.dataset.pick);
      return;
    }
    const chip = e.target.closest('[data-pchip]');
    if (chip) {
      pick.chip = chip.dataset.pchip;
      pick.active = 0;
      renderPickList();
      return;
    }
    const opt = e.target.closest('[data-choose]');
    if (opt) {
      const cat = pick.cat;
      closePick();
      setOwned(cat, opt.dataset.choose);
      document.querySelector(`[data-pick="${cat}"]`)?.focus();
    }
  });
  form.addEventListener('input', (e) => {
    if (!e.target.matches('.may-search')) return;
    pick.q = e.target.value;
    pick.active = 0;
    renderPickList();
  });
  form.addEventListener('keydown', (e) => {
    if (!pick.cat) {
      if (e.key === 'ArrowDown' && e.target.closest('[data-pick]')) { e.preventDefault(); openPick(e.target.closest('[data-pick]').dataset.pick); }
      return;
    }
    const opts = [...document.querySelectorAll('#may-pick .may-opt')];
    if (e.key === 'Escape') { e.preventDefault(); closePick(true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      pick.active = Math.max(0, Math.min(opts.length - 1, pick.active + (e.key === 'ArrowDown' ? 1 : -1)));
      renderPickList();
    } else if (e.key === 'Enter' && e.target.matches('.may-search')) {
      e.preventDefault();
      opts[pick.active]?.click();
    }
  });
  // click outside closes the panel
  document.addEventListener('pointerdown', (e) => {
    if (pick.cat && !e.target.closest('.may-field.is-open')) closePick();
  });
  const result = $('#may-result');
  const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  result.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-pop]');
    if (!t || !fine()) return;
    clearTimeout(pop.closeT);
    clearTimeout(pop.openT);
    const row = t.closest('.may-row');
    if (pop.cat === t.dataset.pop) return;
    pop.openT = setTimeout(() => openPop(t.dataset.pop, row), 140);
  });
  result.addEventListener('mouseout', (e) => {
    if (!fine() || !e.target.closest('[data-pop]')) return;
    clearTimeout(pop.openT);
    const to = e.relatedTarget;
    if (pop.sticky || to?.closest?.('#may-pop') || (to && e.target.closest('.may-row')?.contains(to))) return;
    pop.closeT = setTimeout(closePop, 220);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop.cat) closePop(); });
  document.addEventListener('pointerdown', (e) => {
    if (pop.cat && !e.target.closest('#may-pop') && !e.target.closest('[data-pop]')) closePop();
  });
  addEventListener('resize', () => pop.cat && placePop());
  addEventListener('scroll', () => { if (pop.cat && fine() && !pop.sticky) closePop(); else if (pop.cat) placePop(); }, { passive: true });
  result.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pop]');
    if (t) {
      e.preventDefault();
      if (pop.cat === t.dataset.pop && pop.sticky) closePop();
      else openPop(t.dataset.pop, t.closest('.may-row'), true);
      return;
    }
  });
  $('#may-result').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) addToBasket([add.dataset.add]);
    const more = e.target.closest('[data-more]');
    if (more) {
      mayExpanded.add(more.dataset.more);
      renderMayResult();
      document.querySelector(`.may-need[data-need="${more.dataset.more}"]`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
      return;
    }
    const less = e.target.closest('[data-less]');
    if (less) {
      mayExpanded.delete(less.dataset.less);
      delete mayFilters[less.dataset.less];
      renderMayResult();
      return;
    }
    const f = e.target.closest('[data-mcat][data-filter]');
    if (f) {
      const cat = f.dataset.mcat;
      const chosen = (mayFilters[cat] ||= {});
      chosen[f.dataset.filter] = f.dataset.value;
      pruneChosen(cat, partsOf(cat).filter((p) => fits(state.owned, cat, p)), chosen);
      const card = f.closest('.may-need');
      const top = card.getBoundingClientRect().top;
      renderMayResult();
      // keep the card where it was so the page does not jump while tapping chips
      const again = document.querySelector(`.may-need[data-need="${cat}"]`);
      if (again) scrollBy(0, again.getBoundingClientRect().top - top);
    }
  });
  $('#may-clear').addEventListener('click', () => {
    state.owned = {};
    mayExpanded.clear();
    for (const k of Object.keys(mayFilters)) delete mayFilters[k];
    writeMayHash();
    renderMayForm();
    renderMayResult();
  });
  $('#may-share').addEventListener('click', async () => {
    writeMayHash();
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Nakopya ang link! I-send sa nagtanong.');
    } catch {
      toast('Kopyahin ang link sa address bar.');
    }
  });
}

// ---------- home page cards ----------
// ---------- videos (home) ----------
// data/videos.json comes from tools/fb_videos.py (Facebook Graph API). No file or no videos: the section stays hidden.
const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>';
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (!(days >= 0)) return '';
  if (days < 1) return 'ngayong araw';
  if (days < 7) return `${days} araw na`;
  if (days < 30) return `${Math.floor(days / 7)} linggo na`;
  if (days < 365) return `${Math.floor(days / 30)} buwan na`;
  return `${Math.floor(days / 365)} taon na`;
}
const duration = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

async function initVideos() {
  const section = $('#videos');
  let data;
  try {
    const res = await fetch(new URL('data/videos.json', ROOT), { cache: 'no-cache' });
    if (!res.ok) return;
    data = await res.json();
  } catch { return; }
  if (!data?.trending?.length && !data?.latest?.length) return;
  if (data.page?.url) $('#vid-follow').href = data.page.url;
  else $('#vid-follow').hidden = true;
  section.hidden = false;

  const grid = $('#vid-grid');
  const render = (list) => {
    grid.innerHTML = list.map((v, i) => `
      <article class="vid">
        <div class="vid-media">
          <button type="button" class="vid-play" data-play="${i}" aria-label="I-play: ${esc(v.title)}" data-tip="I-play dito">
            ${v.thumb ? `<img src="${esc(new URL(v.thumb, ROOT).href)}" alt="" loading="lazy" decoding="async">` : ''}
            <span class="vid-badge">${PLAY_ICON}</span>
            ${v.length ? `<span class="vid-len">${duration(v.length)}</span>` : ''}
          </button>
        </div>
        <h3 class="vid-title">${esc(v.title)}</h3>
        <p class="vid-meta">${[v.views ? `${compact.format(v.views)} views` : v.engagement ? `♥ ${compact.format(v.engagement)}` : '', ago(v.created)].filter(Boolean).join(' · ')}</p>
      </article>`).join('');
    grid.onclick = (e) => {
      const b = e.target.closest('[data-play]');
      if (!b) return;
      const v = list[Number(b.dataset.play)];
      // the Facebook player loads only when asked, so the home page stays fast
      const src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v.url)}&show_text=false&autoplay=true`;
      b.outerHTML = `<iframe src="${esc(src)}" title="${esc(v.title)}" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>`;
    };
  };
  const tabs = section.querySelectorAll('[data-vtab]');
  const show = (key) => {
    tabs.forEach((t) => { const on = t.dataset.vtab === key; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    render(data[key] || []);
  };
  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.vtab)));
  // nothing to rank by: start on "Bago"
  show(data.trending?.some((v) => v.views || v.engagement) ? 'trending' : 'latest');
  // The section starts hidden until the JSON loads, so the browser's own #videos jump finds nothing on arrival
  // from another page. Jump there ourselves once it exists (instantly: the visitor already asked to go there).
  if (location.hash === '#videos') requestAnimationFrame(() => section.scrollIntoView({ block: 'start' }));
}

// Touch screens have no hover: play each card's animation once when it is mostly on screen.
function bindRouteCards() {
  if (matchMedia('(hover: hover) and (pointer: fine)').matches || reducedMotion || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      e.target.classList.add('is-live');
      setTimeout(() => e.target.classList.remove('is-live'), 1800);
    }
  }, { threshold: 0.7 });
  document.querySelectorAll('.route').forEach((r) => io.observe(r));
}

// ---------- nav dropdown + scroll to top (every page) ----------
// Hover tips: one shared bubble for icon-only controls (and anything with data-tip).
// Mouse: shows after a short rest. Keyboard: shows on focus. Lives on <body> so popover/list overflow never clips it.
const TIP_SEL = '[data-tip], .nav-basket, .icon-btn, .sheet-side-next, .basket-fab, .to-top, .viewer-expand, .viewer-btn, .nav-caret, .part-thumb, .may-row-thumb, .pop-close, .pop-add';
function bindTips() {
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'tip';
  document.body.append(tip);
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let cur = null, timer = 0;
  const text = (el) => el.dataset.tip || el.getAttribute('aria-label') || '';
  const show = (el) => {
    const t = text(el); if (!t || el.disabled) return;
    cur = el; tip.textContent = t; tip.classList.remove('below');
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    let top = r.top - h - 8;
    if (top < 8) { top = r.bottom + 8; tip.classList.add('below'); }
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    tip.classList.add('on');
  };
  const hide = () => { clearTimeout(timer); cur = null; tip.classList.remove('on'); };
  document.addEventListener('mouseover', (e) => {
    if (!fine.matches) return;
    const el = e.target.closest?.(TIP_SEL);
    if (el === cur) return;
    hide();
    if (el) timer = setTimeout(() => show(el), 350);
  });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest?.(TIP_SEL);
    if (el && !el.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.(TIP_SEL);
    if (el && el.matches(':focus-visible')) show(el); else hide();
  });
  document.addEventListener('focusout', hide);
  addEventListener('pointerdown', hide, true);
  addEventListener('scroll', hide, { capture: true, passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}

function bindChrome() {
  bindTips();
  // Parts dropdown: hover opens it on a mouse; the caret button toggles it for touch and keyboard
  const drop = $('.nav-drop');
  const caret = drop?.querySelector('.nav-caret');
  if (caret) {
    const set = (open) => { drop.classList.toggle('is-open', open); caret.setAttribute('aria-expanded', open); };
    caret.addEventListener('click', () => set(!drop.classList.contains('is-open')));
    drop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { set(false); caret.focus(); } });
    document.addEventListener('pointerdown', (e) => { if (!drop.contains(e.target)) set(false); });
    drop.addEventListener('focusout', (e) => { if (!drop.contains(e.relatedTarget)) set(false); });
  }
  // scroll to top: shows once you are a screen down; sits above the Basket
  const top = $('#to-top');
  if (top) {
    top.hidden = false;
    let shown = false;
    const check = () => {
      const want = scrollY > innerHeight * 0.9;
      if (want !== shown) { shown = want; top.classList.toggle('is-shown', want); top.tabIndex = want ? 0 : -1; }
    };
    addEventListener('scroll', check, { passive: true });
    check();
    top.addEventListener('click', () => scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }));
  }
}

// Parts page: /parts/#cat=gpu (from the nav dropdown) opens that category's list
function openCatFromHash() {
  const cat = new URLSearchParams(location.hash.slice(1)).get('cat');
  if (!cat || !CATEGORIES.includes(cat)) return;
  openSheet(cat);
  // clear it, so picking the same category again from the menu still opens it
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------- misc ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

async function init() {
  $('#year').textContent = new Date().getFullYear();
  bindChrome();
  const has = (sel) => !!document.querySelector(sel);
  if (has('#stage')) {
    renderStageChips();
    bindHeroScroll();
    bindPeek();
    deferStage();
  }
  try {
    const [partsRes, buildsRes] = await Promise.all([fetch(new URL('data/parts.json', ROOT)), fetch(new URL('data/builds.json', ROOT))]);
    if (!partsRes.ok || !buildsRes.ok) throw new Error(`HTTP ${partsRes.status}/${buildsRes.status}`);
    const data = await partsRes.json();
    const { builds } = await buildsRes.json();
    catalog = { parts: data.parts, meta: data.meta, byId: new Map(data.parts.map((p) => [p.id, p])) };
    readHash();
    bindSheet();
    initBasket({
      byId: (id) => catalog.byId.get(id),
      peso,
      thumb,
      esc,
      toast,
      label: (cat) => CATEGORY_LABEL[cat],
    });
    if (has('#stage')) bindViewer();
    if (has('#cat-cards')) {
      renderCategoryCards();
      openCatFromHash();
      addEventListener('hashchange', openCatFromHash);
    }
    if (has('#budget')) {
      renderForm();
      bindForm();
      bindParts();
      if (state.build) renderResult(false);
      else liveBuild();
    }
    if (has('#samples')) renderSamples(builds);
    if (has('.routes')) bindRouteCards();
    // freshness: when the Shopee Mall prices were last checked
    const pd = $('[data-price-date]');
    if (pd && catalog.meta?.priceChecked) {
      const d = new Date(`${catalog.meta.priceChecked}T00:00:00`);
      pd.textContent = `${catalog.parts.length} parts · presyo noong ${d.toLocaleDateString('fil-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      pd.hidden = false;
    }
    if (has('#videos')) initVideos();
    if (has('#may-form')) {
      renderMayForm();
      renderMayResult();
      bindMay();
      // a share link opened while already on this page only changes the hash: re-read it
      addEventListener('hashchange', () => {
        const params = new URLSearchParams(location.hash.slice(1));
        if (!params.has('may')) return;
        state.owned = decodeOwned(params.get('may'), catalog.byId);
        renderMayForm();
        renderMayResult();
      });
    }
  } catch (err) {
    console.error(err);
    document.querySelector('main .section, main')?.insertAdjacentHTML('beforeend', '<p class="error">Hindi ma-load ang parts list. I-refresh ang page.</p>');
  }
}

init();
