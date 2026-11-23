#!/usr/bin/env python3
"""Write llms.txt (short map) and llms-full.txt (the content) for AI search crawlers.

Most AI crawlers (ChatGPT, Claude, Perplexity) read raw HTML and don't run JavaScript, so the builds,
parts, Troubleshooter and Ark answers that app.js renders are invisible to them. These two plain-text
files carry the same data straight from data/*.json. Called by tools/pages.py; never edit the outputs.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://respecz.com/'
CATS = [('cpu', 'CPU'), ('motherboard', 'Motherboard'), ('ram', 'RAM'), ('gpu', 'Graphics card (GPU)'),
        ('ssd', 'SSD'), ('psu', 'Power supply (PSU)'), ('case', 'Case'), ('cooler', 'CPU cooler')]


def load(name):
    return json.loads((ROOT / 'data' / name).read_text())


def peso(n):
    return f'₱{n:,}'


def head():
    return f"""# ReSpecz PC Builder

> Libreng PC builder para sa Pilipinas (respecz.com) ni ReSpecz, isang Filipino tech creator. Ilagay ang budget at gamit
> (gaming, editing, school) at bibigyan ka ng compatible na set ng parts na may presyo at Shopee Mall link. May compatibility
> checker para sa parts na meron ka na, ready builds, at PC Troubleshooter. Taglish ang site.

- Presyo: Shopee Mall listings; nagbabago ang presyo, kaya i-check sa Shopee bago bumili.
- May affiliate links ang site (maliit na commission, walang dagdag sa presyo ng bumibili): {SITE}disclosure/
- Facebook: https://www.facebook.com/1378136052056179 · TikTok: https://www.tiktok.com/@resp3cz
"""


def short(parts, builds, ts):
    out = [head(), '## Pages\n',
           f'- [Home]({SITE}): budget PC builder at 3D PC',
           f'- [Mag-Build]({SITE}build/): budget + gamit → compatible na buong set',
           f'- [May Parts na Ako]({SITE}may/): compatibility checker para sa parts na meron ka na',
           f'- [Parts]({SITE}parts/): {len(parts)} parts (CPU, motherboard, RAM, GPU, SSD, PSU, case, cooler) na may presyo',
           f'- [Ready Builds]({SITE}builds/): ' + ', '.join(b['title'] for b in builds),
           f'- [Troubleshooter]({SITE}troubleshoot/): ' + ', '.join(s['sub'].lower() for s in ts['symptoms']),
           '', '## Full content\n', f'- [llms-full.txt]({SITE}llms-full.txt): builds, parts at presyo, troubleshooting steps, at Q&A', '']
    return '\n'.join(out)


def full(meta, parts, builds, ts, ark):
    by_id = {p['id']: p for p in parts}
    out = [head(), f'Presyo noong {meta["priceChecked"]}. {meta["priceNote"]}\n']

    out.append('## Ready PC builds\n')
    for b in builds:
        items = [by_id[i] for i in b['parts'].values() if i in by_id]
        total = sum(p.get('price') or 0 for p in items)
        out.append(f'### {b["title"]}\n\n{b["blurb"]}\n')
        out += [f'- {dict(CATS).get(p["category"], p["category"])}: {p["name"]}' + (f' ({peso(p["price"])})' if p.get('price') else '') for p in items]
        out.append(f'- Estimated total: {peso(total)}\n')

    out.append(f'## PC parts sa catalog\n\nBawat part ay may Shopee Mall link sa {SITE}parts/\n')
    for cat, label in CATS:
        rows = sorted((p for p in parts if p['category'] == cat), key=lambda p: p.get('price') or 0)
        if not rows:
            continue
        out.append(f'### {label}\n')
        for p in rows:
            units = {'socket': '{}', 'cores': '{}', 'capacityGB': '{}GB', 'vramGB': '{}GB VRAM', 'watts': '{}W', 'formFactor': '{}'}
            spec = ', '.join(u.format(p[k]) for k, u in units.items() if p.get(k))
            line = f'- {p["name"]}' + (f' ({peso(p["price"])})' if p.get('price') else '') + (f' · {spec}' if spec else '')
            out.append(line + (f' · {p["note"]}' if p.get('note') else ''))
        out.append('')

    out.append(f'## PC troubleshooting\n\n{ts["meta"]["note"]} Interactive na bersyon: {SITE}troubleshoot/\n')
    for n in ts['nodes'].values():
        if isinstance(n.get('steps'), list):
            out.append(f'### {n["title"]}\n')
            if n.get('why'):
                out.append(n['why'] + '\n')
            out += [f'{i}. {s}' for i, s in enumerate(n['steps'], 1)]
            out.append('')

    out.append('## Q&A (mga madalas itanong kay Ark, ang assistant ng site)\n')
    for e in ark['entries']:
        if e.get('hidden') or e.get('compute') or not e.get('a'):
            continue
        out.append(f'### {e["q"]}\n\n{e["a"]}\n')
    return '\n'.join(out).rstrip() + '\n'


def main():
    pj = load('parts.json')
    parts = [p for p in pj['parts'] if not p.get('stock')]
    builds = load('builds.json')['builds']
    ts, ark = load('troubleshoot.json'), load('ark.json')
    (ROOT / 'llms.txt').write_text(short(parts, builds, ts))
    (ROOT / 'llms-full.txt').write_text(full(pj['meta'], parts, builds, ts, ark))
    print('wrote llms.txt, llms-full.txt')


if __name__ == '__main__':
    main()
