#!/usr/bin/env python3
"""Build the static pages from site/ (no dependencies, no build server).

    python3 tools/pages.py        # or: npm run pages

site/layout.html is the shared shell (head, nav, footer, mobile tab bar, dialogs); site/pages/<name>.html
is each page's <main> content. Output: index.html at the root and <slug>/index.html for every other page,
so each page has its own URL (…/build/, …/may/) that works on GitHub Pages and in link previews.
Paths inside pages use {{root}} so they work at any depth.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
SITE_URL = 'https://respecz.com/'

IMPORTMAP = '''  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
      }
    }
  </script>
'''

# slug '' = home. nav = label in the top nav (None = not listed), tab = label + icon in the mobile tab bar.
PAGES = [
    dict(name='home', slug='', nav=None, tab='Home',
         title='PC Builder Philippines: budget PC build + compatibility check · ReSpecz',
         og_title='ReSpecz PC Builder',
         description='Plan your PC build bago mag-checkout. Parts mula Shopee Mall, may compatibility check, budget builder at 3D PC.'),
    dict(name='parts', slug='parts/', nav='Parts', tab='Parts',
         title='PC parts Philippines: CPU, GPU, RAM, SSD at iba pa · ReSpecz PC Builder',
         og_title='Lahat ng PC parts, galing sa Shopee Mall',
         description='CPU, motherboard, RAM, GPU, SSD, PSU, case at cooler. May filter, presyo at Shopee Mall link bawat isa.'),
    dict(name='build', slug='build/', nav='Mag-Build', tab='Mag-Build',
         title='PC build sa budget mo: gaming, editing, school · ReSpecz PC Builder',
         og_title='Mag-Build: i-set ang budget, kami na sa parts',
         description='Ilagay ang budget at gamit (gaming, editing, school). Bibigyan ka namin ng compatible na set na may Shopee links.'),
    dict(name='may', slug='may/', nav='May Parts na Ako', tab='May Parts',
         title="PC compatibility checker: ano ang swak sa parts mo? · ReSpecz PC Builder",
         og_title='May parts ka na? Tingnan ang compatible',
         description='Piliin ang meron ka na (RAM, CPU, GPU…) at ipapakita namin ang compatible na motherboard, RAM, PSU at iba pa.'),
    dict(name='builds', slug='builds/', nav=None, tab=None,  # in the Parts dropdown, not the top nav
         title='Ready PC builds Philippines: gaming, editing at school · ReSpecz PC Builder',
         og_title='Ready PC builds mula ₱40K',
         description='Kumpletong PC builds para sa gaming, editing at school, may total na presyo at Shopee links.'),
    dict(name='troubleshoot', slug='troubleshoot/', nav='Troubleshoot', tab='Troubleshoot',
         title='PC troubleshooter: ayaw mag-on, walang display, nagre-restart · ReSpecz PC Builder',
         og_title='May problema ang PC mo? Hanapin natin ang dahilan',
         description='Piliin ang problema (ayaw mag-on, walang display, nagre-restart, mainit, mabagal sa games) at sagutin ang ilang tanong. May step-by-step na checks na kaya mong gawin.'),
    dict(name='disclosure', slug='disclosure/', nav=None, tab=None,
         title='Affiliate disclosure · ReSpecz PC Builder',
         og_title='Paano kumikita ang ReSpecz PC Builder',
         description='Paano gumagana ang Shopee affiliate links sa site, saan galing ang presyo, at bakit gabay lang ang compatibility check.'),
]

SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{}</svg>'
TAB_ICONS = {
    'home': '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
    'parts': '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    'build': '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.3-.7-.7-2.3z"/>',
    'may': '<path d="m9 12 2 2 4-4"/><rect x="3.5" y="3.5" width="17" height="17" rx="3"/>',
    'troubleshoot': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M11 8v3.5M11 14h.01"/>',
    'builds': '<rect x="6" y="2.5" width="12" height="19" rx="1.8"/><path d="M9 6h6M9 8.5h6"/><circle cx="12" cy="15" r="2.5"/>',
}


import hashlib
import json
from datetime import datetime, timedelta, timezone

SOCIAL = ['https://www.facebook.com/1378136052056179', 'https://www.tiktok.com/@resp3cz']
NOINDEX = {'disclosure'}   # thin legal page: reachable, but kept out of search results


def ld_json(page):
    """schema.org JSON-LD: the brand + site on the home page, a breadcrumb on every other page."""
    url = SITE_URL + page['slug']
    if page['name'] == 'home':
        data = {'@context': 'https://schema.org', '@graph': [
            {'@type': 'Organization', '@id': SITE_URL + '#org', 'name': 'ReSpecz', 'url': SITE_URL,
             'logo': SITE_URL + 'assets/favicon.png', 'sameAs': SOCIAL},
            {'@type': 'WebSite', '@id': SITE_URL + '#site', 'name': 'ReSpecz PC Builder', 'url': SITE_URL,
             'inLanguage': 'fil-PH', 'publisher': {'@id': SITE_URL + '#org'}},
            {'@type': 'WebApplication', 'name': 'ReSpecz PC Builder', 'url': SITE_URL,
             'applicationCategory': 'UtilitiesApplication', 'operatingSystem': 'Any', 'inLanguage': 'fil-PH',
             'description': page['description'], 'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'PHP'},
             'publisher': {'@id': SITE_URL + '#org'}},
        ]}
    else:
        name = page['nav'] or page['og_title']
        data = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE_URL},
            {'@type': 'ListItem', 'position': 2, 'name': name, 'item': url},
        ]}
    return '  <script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>\n'


def robots_meta(page):
    return '  <meta name="robots" content="noindex, follow">\n' if page['name'] in NOINDEX else ''


def write_robots_and_sitemap():
    today = (datetime.now(timezone.utc) + timedelta(hours=8)).date().isoformat()
    urls = '\n'.join(f'  <url><loc>{SITE_URL}{p["slug"]}</loc><lastmod>{today}</lastmod></url>'
                     for p in PAGES if p['name'] not in NOINDEX)
    (ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n')
    # site/, tools/ and test/ are source files GitHub Pages also serves; js/, data/ and assets/ stay open so Google can render the pages
    (ROOT / 'robots.txt').write_text('User-agent: *\nDisallow: /site/\nDisallow: /tools/\nDisallow: /test/\n\n'
        f'Sitemap: {SITE_URL}sitemap.xml\n')
    print('wrote robots.txt, sitemap.xml')


def version(path):
    """Short content hash, so a changed stylesheet or script is never served from a stale browser cache."""
    return hashlib.sha1((ROOT / path).read_bytes()).hexdigest()[:8]


# Parts dropdown: one link per category; the Parts page opens that category's list (#cat=…)
PART_CATS = [('cpu', 'CPU'), ('motherboard', 'Motherboard'), ('ram', 'RAM'), ('gpu', 'Graphics card (GPU)'),
             ('ssd', 'SSD'), ('psu', 'Power supply (PSU)'), ('case', 'Case'), ('cooler', 'CPU cooler')]
CARET = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def nav_html(page, root, current):
    home = {'name': 'home'}
    out = [f'        <a href="{root}"{current(home)}>Home</a>']
    for p in PAGES:
        if not p['nav']:
            continue
        if p['name'] == 'parts':
            items = '\n'.join(f'            <a role="menuitem" href="{root}parts/#cat={c}">{label}</a>' for c, label in PART_CATS)
            # Ready Builds lives in this menu too, under a divider; on that page the Parts link is the current one
            on_builds = page['name'] == 'builds'
            here = ' aria-current="page"' if on_builds else ''
            items += ('\n            <span class="nav-menu-sep" role="separator"></span>'
                      f'\n            <a role="menuitem" href="{root}builds/"{here}>Ready Builds</a>')
            parts_current = ' aria-current="page"' if on_builds else current(p)
            out.append(f"""        <div class="nav-drop">
          <a href="{root}parts/"{parts_current}>Parts</a>
          <button type="button" class="nav-caret" aria-expanded="false" aria-haspopup="menu" aria-label="Mga category ng parts at Ready Builds">{CARET}</button>
          <div class="nav-menu" role="menu">
{items}
          </div>
        </div>""")
        else:
            out.append(f'        <a href="{root}{p["slug"]}"{current(p)}>{p["nav"]}</a>')
    out.append(f'        <a href="{root}#videos">Videos</a>')
    return '\n'.join(out)


def render(page):
    depth = page['slug'].count('/')
    root = '../' * depth or './'
    current = lambda p: ' aria-current="page"' if p['name'] == page['name'] else ''
    nav_links = nav_html(page, root, current)
    tabbar = '\n'.join(
        f'    <a href="{root}{p["slug"]}"{current(p)}>{SVG.format(TAB_ICONS[p["name"]])}<span>{p["tab"]}</span></a>'
        for p in PAGES if p['tab'])
    out = (SITE / 'layout.html').read_text()
    fields = {
        'page': page['name'],
        'title': page['title'],
        'og_title': page['og_title'],
        'description': page['description'],
        'url': SITE_URL + page['slug'],
        'site': SITE_URL,
        'head_extra': robots_meta(page) + ld_json(page) + (IMPORTMAP if page['name'] == 'home' else ''),
        'nav_links': nav_links,
        'tabbar': tabbar,
        'main': (SITE / 'pages' / f'{page["name"]}.html').read_text().rstrip('\n') + '\n',
        'disclosure': '' if page['name'] == 'disclosure' else (SITE / 'disclosure.html').read_text(),
        'dialogs': (SITE / 'dialogs.html').read_text(),
    }
    for k, v in fields.items():
        out = out.replace('{{' + k + '}}', v)
    out = out.replace('{{root}}', root)  # placeholders inside the page bodies
    out = out.replace(f'{root}styles.css"', f'{root}styles.css?v={version("styles.css")}"')
    for js in ('js/app.js', 'js/ark.js', 'js/troubleshoot.js'):
        out = out.replace(f'{root}{js}"', f'{root}{js}?v={version(js)}"')
    assert '{{' not in out, f'{page["name"]}: unfilled placeholder'
    return out


def main():
    for page in PAGES:
        dest = ROOT / page['slug'] / 'index.html'
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(render(page))
        print('wrote', dest.relative_to(ROOT))
    write_robots_and_sitemap()


if __name__ == '__main__':
    main()
