import { CATEGORIES, CATEGORY_LABEL, checkBuild, estimateLoad, totalPrice } from './compat.js';
import { suggestBuild, USE_CASES } from './picker.js';
import { ICONS } from './icons.js';

const $ = (sel) => document.querySelector(sel);
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const MIN_BUDGET = 35000;
const MAX_BUDGET = 250000;
const BUDGET_PRESETS = [40000, 50000, 60000, 80000, 100000, 130000, 160000];

const state = { budget: 60000, useCase: 'gaming', build: null };
let catalog = { parts: [], byId: new Map(), meta: {} };

function capacity(gb) {
  return gb >= 1000 ? `${gb / 1000}TB` : `${gb}GB`;
}

function specLine(p) {
  switch (p.category) {
    case 'cpu': return `${p.socket} · ${p.cores} · ${p.tdp}W${p.igpu ? ' · may built-in graphics' : ''}`;
    case 'motherboard': return `${p.socket} · ${p.chipset} · ${p.formFactor} · ${p.memType} x${p.memSlots}${p.wifi ? ' · WiFi' : ''}`;
    case 'ram': return `${p.memType}-${p.speed} · ${p.sticks}x${p.capacityGB / p.sticks}GB`;
    case 'gpu': return `${p.vramGB}GB VRAM · ${p.tdp}W · ${p.lengthMm}mm`;
    case 'ssd': return `${p.interface} · ${capacity(p.capacityGB)}`;
    case 'psu': return `${p.watts}W · ${p.rating}`;
    case 'case': return `${p.formFactors.join(' / ')} · GPU hanggang ${p.maxGpuMm}mm`;
    case 'cooler': return p.stock ? 'Kasama na sa box ng CPU' : `${p.type === 'aio' ? '240mm liquid (AIO)' : `Air tower ${p.heightMm}mm`} · kaya ang ${p.tdpRating}W`;
    default: return '';
  }
}

function shopLink(p) {
  if (p.shopeeUrl) return { href: p.shopeeUrl, label: 'Tingnan sa Shopee', affiliate: true };
  if (!p.search) return null;
  return { href: `https://shopee.ph/search?keyword=${encodeURIComponent(p.search)}`, label: 'Hanapin sa Shopee', affiliate: false };
}

// ---------- URL hash (shareable builds) ----------
function writeHash() {
  if (!state.build) return;
  const ids = CATEGORIES.map((c) => state.build[c]?.id || '-').join(',');
  history.replaceState(null, '', `#u=${state.useCase}&b=${state.budget}&p=${ids}`);
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
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

// ---------- form ----------
function renderForm() {
  const range = $('#budget');
  range.value = state.budget;
  $('#budget-out').textContent = peso.format(state.budget);

  $('#budget-chips').innerHTML = BUDGET_PRESETS.map((v) =>
    `<button type="button" class="chip${v === state.budget ? ' active' : ''}" data-budget="${v}">₱${v / 1000}K</button>`).join('');

  $('#usecase').innerHTML = Object.entries(USE_CASES).map(([key, u]) => `
    <button type="button" role="radio" aria-checked="${key === state.useCase}" class="segment${key === state.useCase ? ' active' : ''}" data-usecase="${key}">
      <span class="seg-title">${u.label}</span>
      <span class="seg-hint">${u.hint}</span>
    </button>`).join('');
}

function bindForm() {
  $('#budget').addEventListener('input', (e) => {
    state.budget = Number(e.target.value);
    $('#budget-out').textContent = peso.format(state.budget);
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.budget) === state.budget));
  });
  $('#budget-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-budget]');
    if (!chip) return;
    state.budget = Number(chip.dataset.budget);
    renderForm();
  });
  $('#usecase').addEventListener('click', (e) => {
    const seg = e.target.closest('[data-usecase]');
    if (!seg) return;
    state.useCase = seg.dataset.usecase;
    renderForm();
  });
  $('#build-btn').addEventListener('click', () => {
    const r = suggestBuild(catalog.parts, state.budget, state.useCase);
    if (r.error) {
      state.build = null;
      showError(r);
      return;
    }
    state.build = r.build;
    renderResult(true);
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

function showError(r) {
  const result = $('#result');
  result.hidden = false;
  $('#summary-label').textContent = 'Kulang ang budget';
  $('#total').textContent = peso.format(r.minBudget);
  $('#usecase-tag').textContent = USE_CASES[state.useCase].label;
  $('#meter-fill').style.width = '100%';
  $('#meter-fill').classList.add('over');
  $('#budget-note').textContent = `Para sa ${USE_CASES[state.useCase].label}, mga ${peso.format(r.minBudget)} ang pinakamababang kumpletong build sa listahan namin. Subukan ang mas mataas na budget o ibang gamit.`;
  $('#compat-list').innerHTML = '';
  $('#parts').innerHTML = '';
  $('#price-note').textContent = '';
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- result ----------
function optionLabel(cat, p) {
  const trial = { ...state.build, [cat]: p };
  const bad = checkBuild(trial).some((r) => r.level === 'fail');
  const name = p ? p.name : 'Walang GPU (built-in graphics)';
  const price = p ? ` · ${peso.format(p.price)}` : '';
  return `${bad ? '⚠ ' : ''}${name}${price}${bad ? ' (hindi compatible)' : ''}`;
}

function renderParts() {
  const list = $('#parts');
  list.innerHTML = '';
  const tpl = $('#part-tpl');

  for (const cat of CATEGORIES) {
    const p = state.build[cat];
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.category = cat;
    node.querySelector('.part-icon').innerHTML = ICONS[cat];
    node.querySelector('.part-cat').textContent = CATEGORY_LABEL[cat];
    node.querySelector('.part-name').textContent = p ? p.name : 'Walang GPU';
    node.querySelector('.part-spec').textContent = p ? specLine(p) : 'Gagamitin ang built-in graphics ng CPU.';
    node.querySelector('.part-note').textContent = p?.note || '';
    node.querySelector('.part-price').textContent = p ? (p.price ? `~${peso.format(p.price)}` : 'Libre') : '₱0';

    const select = node.querySelector('select');
    select.setAttribute('aria-label', `Palitan ang ${CATEGORY_LABEL[cat]}`);
    const options = catalog.parts.filter((x) => x.category === cat).sort((a, b) => a.price - b.price);
    const all = cat === 'gpu' ? [null, ...options] : options;
    select.innerHTML = `<option disabled>Palitan…</option>` + all.map((o) =>
      `<option value="${o ? o.id : '-'}"${(o?.id || '-') === (p?.id || '-') ? ' selected' : ''}>${optionLabel(cat, o)}</option>`).join('');
    select.addEventListener('change', () => {
      state.build[cat] = select.value === '-' ? null : catalog.byId.get(select.value);
      renderResult(false);
    });

    const shop = node.querySelector('.btn-shop');
    const link = p && shopLink(p);
    if (link) {
      shop.href = link.href;
      shop.textContent = link.label;
      shop.dataset.affiliate = link.affiliate;
    } else {
      shop.remove();
    }
    list.appendChild(node);
  }
}

function renderCompat() {
  const results = checkBuild(state.build);
  const order = { fail: 0, warn: 1, ok: 2 };
  results.sort((a, b) => order[a.level] - order[b.level]);
  const icon = { ok: '✓', warn: '!', fail: '✕' };
  $('#compat-list').innerHTML = results.map((r) =>
    `<li class="compat-${r.level}"><span class="dot" aria-hidden="true">${icon[r.level]}</span><span>${r.text}</span></li>`).join('');
  return results;
}

function renderResult(scroll) {
  const result = $('#result');
  result.hidden = false;
  const total = totalPrice(state.build);
  const results = renderCompat();
  const fails = results.filter((r) => r.level === 'fail').length;

  $('#summary-label').textContent = fails ? `Tantiyang total · ${fails} problema sa compatibility` : 'Tantiyang total';
  $('#total').textContent = peso.format(total);
  $('#usecase-tag').textContent = USE_CASES[state.useCase].label;
  const pct = Math.min(100, (total / state.budget) * 100);
  const fill = $('#meter-fill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('over', total > state.budget);
  const diff = state.budget - total;
  $('#budget-note').textContent = diff >= 0
    ? `${peso.format(diff)} ang tira sa ${peso.format(state.budget)} na budget · ~${estimateLoad(state.build)}W ang tantiyang load.`
    : `Lampas ng ${peso.format(-diff)} sa ${peso.format(state.budget)} na budget.`;

  renderParts();
  $('#price-note').textContent = `Presyo ng Shopee Mall listing noong ${catalog.meta.priceChecked}. Nagbabago ang presyo, i-check sa Shopee bago bumili.`;
  writeHash();
  if (scroll) result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- sample builds ----------
function renderSamples(builds) {
  $('#samples').innerHTML = builds.map((b) => {
    const parts = Object.fromEntries(CATEGORIES.map((c) => [c, catalog.byId.get(b.parts[c]) || null]));
    const total = totalPrice(parts);
    const highlights = [parts.cpu?.name, parts.gpu?.name || 'Built-in graphics'].filter(Boolean).join(' + ');
    return `
      <article class="glass sample">
        <span class="pill small-pill">${USE_CASES[b.useCase].label}</span>
        <h3>${b.title}</h3>
        <p class="small">${b.blurb}</p>
        <p class="small muted">${highlights}</p>
        <div class="sample-foot">
          <strong>~${peso.format(total)}</strong>
          <button type="button" class="btn btn-ghost" data-sample="${b.id}">Tingnan</button>
        </div>
      </article>`;
  }).join('');

  $('#samples').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sample]');
    if (!btn) return;
    const b = builds.find((x) => x.id === btn.dataset.sample);
    state.useCase = b.useCase;
    state.build = Object.fromEntries(CATEGORIES.map((c) => [c, catalog.byId.get(b.parts[c]) || null]));
    state.budget = Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, Math.ceil(totalPrice(state.build) / 1000) * 1000));
    renderForm();
    renderResult(true);
  });
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
  try {
    const [partsRes, buildsRes] = await Promise.all([fetch('data/parts.json'), fetch('data/builds.json')]);
    if (!partsRes.ok || !buildsRes.ok) throw new Error(`HTTP ${partsRes.status}/${buildsRes.status}`);
    const data = await partsRes.json();
    const { builds } = await buildsRes.json();
    catalog = { parts: data.parts, meta: data.meta, byId: new Map(data.parts.map((p) => [p.id, p])) };
    readHash();
    renderForm();
    bindForm();
    renderSamples(builds);
    if (state.build) renderResult(false);
  } catch (err) {
    console.error(err);
    $('.panel').insertAdjacentHTML('beforeend', '<p class="error">Hindi ma-load ang parts list. I-refresh ang page.</p>');
  }
}

init();
