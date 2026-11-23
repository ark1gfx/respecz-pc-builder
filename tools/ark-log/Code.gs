/**
 * Ark: saves the questions Ark couldn't answer to this Google Sheet, and emails a weekly summary.
 * Setup: tools/ark-log/README.md. Paste this whole file into Extensions > Apps Script of the Sheet.
 *
 * The site sends: { q, kind: 'none' | 'unsure' | 'unhelpful', entry, group, page }.
 * No names, no IP addresses: Apps Script doesn't receive the visitor's IP, and the site strips emails,
 * phone numbers and links from the question before sending.
 */

const SHEET_NAME = 'Tanong';
const MAX_ROWS_PER_HOUR = 300; // spam guard: anyone can call a public web app
const KINDS = { none: 'Walang sagot', unsure: 'Hindi sigurado', unhelpful: 'Hindi nakatulong' };

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const q = clean_(d.q, 200);
    if (!q || !KINDS[d.kind]) return text_('skip');
    if (!underLimit_()) return text_('busy');
    sheet_().appendRow([new Date(), KINDS[d.kind], q, clean_(d.group, 20), clean_(d.entry, 40), clean_(d.page, 60), '']);
    return text_('ok');
  } catch (err) {
    return text_('error');
  }
}

/**
 * For the ReSpecz Studio dashboard (Website view): the last N days, grouped. Needs ?key= equal to the
 * ARK_KEY script property (Project Settings → Script properties), so only the dashboard can read it.
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const key = PropertiesService.getScriptProperties().getProperty('ARK_KEY');
  if (!key || p.key !== key) return json_({ error: 'key' });
  const days = Math.min(90, Math.max(1, Number(p.days) || 30));
  const since = Date.now() - days * 24 * 3600 * 1000;
  const rows = sheet_().getDataRange().getValues().slice(1)
    .filter((r) => r[0] instanceof Date && r[0].getTime() >= since)
    .map((r) => ({ at: r[0].toISOString(), kind: r[1], q: String(r[2]), group: r[3], entry: r[4], page: r[5], done: !!r[6] }));
  const groups = {};
  rows.forEach((r) => {
    const k = r.q.toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const g = groups[k] || (groups[k] = { q: r.q, count: 0, kinds: {}, last: r.at, done: true, entries: {} });
    g.count++;
    g.kinds[r.kind] = (g.kinds[r.kind] || 0) + 1;
    if (r.at > g.last) g.last = r.at;
    if (!r.done) g.done = false;
    if (r.entry) g.entries[r.entry] = true;
  });
  const list = Object.values(groups).map((g) => ({ ...g, entries: Object.keys(g.entries) })).sort((a, b) => (a.done - b.done) || (b.count - a.count));
  return json_({ days, total: rows.length, open: list.filter((g) => !g.done).length, questions: list.slice(0, 200), sheet: SpreadsheetApp.getActive().getUrl() });
}

/** Run once (select it in the toolbar, then Run): emails you every Monday at about 9 AM. */
function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'weeklyDigest').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyDigest').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
}

/** The last 7 days, grouped by question, most asked first. Sent to the Google account that owns this script. */
function weeklyDigest() {
  const rows = sheet_().getDataRange().getValues().slice(1);
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const groups = {};
  rows.filter((r) => r[0] instanceof Date && r[0].getTime() >= since).forEach((r) => {
    const key = String(r[2]).toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const g = groups[key] || (groups[key] = { q: r[2], count: 0, kinds: {} });
    g.count++;
    g.kinds[r[1]] = (g.kinds[r[1]] || 0) + 1;
  });
  const list = Object.values(groups).sort((a, b) => b.count - a.count);
  const url = SpreadsheetApp.getActive().getUrl();
  const body = list.length
    ? `Mga tanong na hindi nasagot ni Ark nitong nakaraang 7 araw (${list.length}):\n\n`
      + list.slice(0, 40).map((g, i) => `${i + 1}. ${g.q}  (${g.count}x · ${Object.keys(g.kinds).join(', ')})`).join('\n')
      + `\n\nBuong listahan: ${url}\nI-mark ang "Tapos" column kapag naidagdag na sa data/ark.json o data/troubleshoot.json.`
    : `Walang bagong tanong na hindi nasagot ni Ark nitong nakaraang 7 araw.\n\n${url}`;
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `Ark weekly review: ${list.length} tanong`, body);
}

// ---------- helpers ----------
function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Kailan', 'Uri', 'Tanong', 'Part', 'Sagot na lumabas', 'Page', 'Tapos']);
    sh.setFrozenRows(1);
  }
  return sh;
}

// plain text only; a leading = + - @ would be read as a formula by Sheets, so it gets a quote
function clean_(v, max) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

function underLimit_() {
  const cache = CacheService.getScriptCache();
  const key = `n-${new Date().getHours()}`;
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 3600);
  return n <= MAX_ROWS_PER_HOUR;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function text_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}
