// Unique-visitor counting (nothing is shown on the site; the number is only visible in ReSpecz Studio).
// Each device is counted once: a flag in localStorage, then one POST to the respecz-visits Worker
// (tools/visitor-counter/). No cookies, no personal data. Does nothing until ENDPOINT is set.

export const ENDPOINT = 'https://visits.respecz.com';

const FLAG = 'rz-counted-v1';

export function shouldHit(storage) {
  try { return !storage.getItem(FLAG); } catch { return false; }
}

async function count() {
  if (!ENDPOINT || navigator.webdriver || !shouldHit(localStorage)) return;
  const res = await fetch(`${ENDPOINT}/hit`, { method: 'POST', keepalive: true });
  if (res.ok) try { localStorage.setItem(FLAG, '1'); } catch { /* private mode */ }
}

if (typeof document !== 'undefined') count().catch(() => { /* counting is optional */ });
