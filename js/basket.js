// "Basket": an on-site basket + step-by-step "Bilhin sa Shopee" checklist.
// Shopee has no cart API for affiliates, so each part opens on Shopee through the affiliate link.
// Shopee credits the LAST affiliate click within about 7 days, so the basket remembers when each link
// was tapped and asks the visitor to tap again when that window has passed.
const BASKET_KEY = 'rs-basket-v1';
const CLICKS_KEY = 'rs-clicks-v1';
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: basket lives for this visit only */ }
};

let items = read(BASKET_KEY, []); // [{ id, done }]
let clicks = read(CLICKS_KEY, {}); // { partId: timestamp }
let ctx = null;

const dateFmt = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });
const $ = (sel) => document.querySelector(sel);

function save() {
  write(BASKET_KEY, items);
  write(CLICKS_KEY, clicks);
  renderFab();
}

export function recordClick(id) {
  if (!id) return;
  clicks[id] = Date.now();
  save();
  if ($('#basket')?.open) renderBasket();
}

export function addToBasket(ids) {
  let added = 0;
  for (const id of ids) {
    if (!id || !ctx.byId(id)?.shopeeUrl) continue;
    if (!items.some((it) => it.id === id)) {
      items.push({ id, done: false });
      added++;
    }
  }
  save();
  ctx.toast(added ? `Naidagdag sa basket (${added}). Tingnan sa "Basket".` : 'Nasa basket mo na ang mga ito.');
  return added;
}

function linkStatus(id) {
  const t = clicks[id];
  if (!t) return { cls: 'st-none', text: 'Hindi pa na-tap ang Shopee link' };
  const until = t + WINDOW_MS;
  if (Date.now() > until) return { cls: 'st-expired', text: 'Lumipas na ang 7 araw: i-tap ulit bago mag-checkout' };
  return { cls: 'st-ok', text: `Valid pa ang link hanggang ${dateFmt.format(new Date(until))}` };
}

function renderFab() {
  const fab = $('#basket-fab');
  if (!fab) return;
  fab.hidden = false; // always visible so visitors know the basket exists
  fab.querySelector('.fab-count').textContent = items.length;
  const navCount = document.querySelector('#nav-basket-count');
  if (navCount) navCount.textContent = items.length;
  document.querySelectorAll('[data-basket-count]').forEach((el) => { el.textContent = items.length; });
  renderPreviews();
}

// Hover card above every Basket button: what's inside + total, without opening the full basket.
function renderPreviews() {
  if (!ctx) return;
  const list = items.map((it) => ctx.byId(it.id)).filter(Boolean);
  const total = list.reduce((sum, p) => sum + p.price, 0);
  const shown = list.slice(0, 5);
  const html = list.length ? `
    <p class="bp-head">Laman ng Basket <span>${list.length} item${list.length === 1 ? '' : 's'}</span></p>
    <ul class="bp-list">${shown.map((p) => `
      <li>
        <span class="bp-thumb">${ctx.thumb(p, p.category)}</span>
        <span class="bp-name">${ctx.esc(p.name)}</span>
        <span class="bp-price">${ctx.peso.format(p.price)}</span>
      </li>`).join('')}</ul>
    ${list.length > shown.length ? `<p class="bp-more">+${list.length - shown.length} pa</p>` : ''}
    <p class="bp-total"><span>Estimated Total</span><strong>${ctx.peso.format(total)}</strong></p>
    <button type="button" class="btn btn-blue btn-sm bp-open" data-open-basket>Buksan ang Basket</button>`
    : '<p class="bp-empty">Wala pang laman. Pindutin ang <strong>Basket</strong> button sa kahit anong part.</p>';
  document.querySelectorAll('[data-basket-preview]').forEach((el) => { el.innerHTML = html; });
}

function renderBasket() {
  const list = items.map((it) => ({ ...it, p: ctx.byId(it.id) })).filter((it) => it.p);
  const done = list.filter((it) => it.done).length;
  const total = list.reduce((sum, it) => sum + it.p.price, 0);
  $('#basket-sub').textContent = `${list.length} item${list.length === 1 ? '' : 's'} · estimated ${ctx.peso.format(total)}`;
  $('#basket-progress-fill').style.width = list.length ? `${(done / list.length) * 100}%` : '0%';
  $('#basket-progress-text').textContent = `${done}/${list.length} nasa Shopee cart mo na`;
  $('#basket-list').innerHTML = list.length ? list.map(({ id, done: isDone, p }) => {
    const st = linkStatus(id);
    return `
      <article class="bk-item${isDone ? ' is-done' : ''}">
        <div class="prod-thumb">${ctx.thumb(p, p.category)}</div>
        <div class="bk-body">
          <p class="part-cat">${ctx.esc(ctx.label(p.category))}</p>
          <h3 class="prod-name">${ctx.esc(p.name)}</h3>
          <p class="bk-status ${st.cls}">${st.text}</p>
          <div class="prod-foot">
            <strong class="prod-price">${ctx.peso.format(p.price)}</strong>
            <a class="btn btn-shop" href="${ctx.esc(p.shopeeUrl)}" target="_blank" rel="sponsored noopener" data-part="${id}">Bilhin sa Shopee</a>
          </div>
          <div class="bk-row">
            <label class="bk-check"><input type="checkbox" data-done="${id}"${isDone ? ' checked' : ''}> Nasa Shopee cart ko na</label>
            <button type="button" class="bk-remove" data-remove="${id}" aria-label="Tanggalin ${ctx.esc(p.name)}">Tanggalin</button>
          </div>
        </div>
      </article>`;
  }).join('') : '<p class="bk-empty">Wala pang laman. Pindutin ang <strong>Basket</strong> button sa kahit anong part o build.</p>';
}

export function openBasket() {
  renderBasket();
  const dlg = $('#basket');
  if (!dlg.open) dlg.showModal();
}

export function initBasket(context) {
  ctx = context;
  renderFab();
  renderPreviews();
  // every Basket button (page corner, product list corner, hover card) opens the full basket;
  // the product list closes first so the two dialogs never stack
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-open-basket], #basket-fab')) return;
    const sheet = $('#sheet');
    if (sheet?.open) sheet.close();
    openBasket();
  });
  $('#nav-basket')?.addEventListener('click', openBasket);
  const dlg = $('#basket');
  $('#basket-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      items = items.filter((it) => it.id !== rm.dataset.remove);
      save();
      renderBasket();
    }
  });
  dlg.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-done]');
    if (!cb) return;
    const it = items.find((x) => x.id === cb.dataset.done);
    if (it) it.done = cb.checked;
    save();
    renderBasket();
  });
  $('#basket-clear').addEventListener('click', () => {
    items = [];
    save();
    renderBasket();
  });
  // every Shopee button on the site records its click time, so the basket knows which links are fresh
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.btn-shop[data-part]');
    if (!a) return;
    recordClick(a.dataset.part);
    // Always a new tab, so the basket stays open on our site. If the browser blocks window.open,
    // fall back to the normal target="_blank" link.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const win = window.open(a.href, '_blank');
    if (win) {
      try { win.opener = null; } catch { /* cross-origin: already detached */ }
      e.preventDefault();
    }
  }, true);
}
