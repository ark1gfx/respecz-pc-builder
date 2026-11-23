// ReSpecz unique-visitor counter (Cloudflare Worker + KV).
// The site keeps a "counted" flag in the visitor's localStorage, so each device sends one hit:
//   POST /hit    -> +1 (only from respecz.com, bots ignored); returns {ok:true}, never the number
//   GET  /count  -> the total, only with header "X-Visits-Key: <VISITS_KEY secret>" (ReSpecz Studio)
// No IPs, cookies or user data are stored: only one number in KV under the key "unique".

const ALLOWED = ['https://respecz.com', 'https://www.respecz.com', 'http://localhost:4870'];
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, origin, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) },
  });

async function readTotal(env) {
  return Number(await env.VISITS.get('unique')) || 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (pathname === '/count' && request.method === 'GET') {
      const key = request.headers.get('X-Visits-Key') || '';
      if (!env.VISITS_KEY || key !== env.VISITS_KEY) return json({ error: 'unauthorized' }, origin, 401);
      return json({ unique: await readTotal(env) }, origin);
    }

    if (pathname === '/hit' && request.method === 'POST') {
      if (ALLOWED.includes(origin) && !BOT.test(request.headers.get('User-Agent') || '')) {
        await env.VISITS.put('unique', String((await readTotal(env)) + 1)); // a rare race can drop one count
      }
      return json({ ok: true }, origin);
    }

    return json({ error: 'not found' }, origin, 404);
  },
};
