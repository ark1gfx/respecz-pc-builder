import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const PAGES = ['index.html', 'parts/index.html', 'build/index.html', 'may/index.html', 'builds/index.html', 'troubleshoot/index.html', 'disclosure/index.html'];
// pages with no mobile tab (reached from the top nav, Home and the footer)
const NO_TAB = ['troubleshoot/', 'disclosure/'];

test('generated pages match site/ (run `npm run pages` after editing site/)', () => {
  const before = PAGES.map((p) => fs.readFileSync(new URL(p, root), 'utf8'));
  execFileSync('python3', ['tools/pages.py'], { cwd: root });
  PAGES.forEach((p, i) => assert.equal(fs.readFileSync(new URL(p, root), 'utf8'), before[i], `${p} was out of date`));
});

test('every page has its own title, one current nav item, and no leftover placeholders', () => {
  const titles = new Set();
  for (const p of PAGES) {
    const html = fs.readFileSync(new URL(p, root), 'utf8');
    assert.ok(!html.includes('{{'), p);
    titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
    const current = html.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0].match(/aria-current="page"/g) || [];
    // pages in the tab bar mark themselves; pages without a tab mark none
    assert.equal(current.length, NO_TAB.some((x) => p.startsWith(x)) ? 0 : 1, `${p}: tab bar current marker`);
  }
  for (const p of PAGES.filter((x) => !x.startsWith('disclosure'))) {
    assert.ok(fs.readFileSync(new URL(p, root), 'utf8').includes('disclosure/">Alamin pa'), `${p}: links to the disclosure page`);
  }
  assert.equal(titles.size, PAGES.length);
});
