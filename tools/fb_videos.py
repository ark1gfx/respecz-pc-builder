#!/usr/bin/env python3
"""Fetch the ReSpecz Facebook Page's videos for the home page "Videos" section (official Graph API).

    python3 tools/fb_videos.py        # or: npm run videos

Uses the Page token that the herk-edit-kit auto-posting dashboard already keeps
(../herk-edit-kit/dashboard/data/fb.json, never copied into this repo). Or set your own in .env.local
(git-ignored, never committed):

    FB_PAGE_ID=1234567890
    FB_PAGE_TOKEN=EAAB...

Writes data/videos.json with two lists, "trending" (most views) and "latest" (newest), and saves each
thumbnail to assets/videos/<id>.jpg (Facebook's thumbnail links expire, so the site keeps its own copy).
Standard library only. Safe to re-run: it rewrites the JSON and refreshes the thumbnails.
"""
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / 'data' / 'videos.json'
THUMB_DIR = ROOT / 'assets' / 'videos'
GRAPH = 'https://graph.facebook.com/v26.0/'  # same version as the herk-edit-kit dashboard
KIT_TOKEN_FILE = ROOT.parent / 'herk-edit-kit' / 'dashboard' / 'data' / 'fb.json'
PER_LIST = 4  # one tidy row of 4 on desktop, 2x2 on tablets
FIELDS = 'id,title,description,created_time,permalink_url,length,picture,likes.summary(true).limit(0),comments.summary(true).limit(0)'


def load_env():
    env = {}
    path = ROOT / '.env.local'
    if path.exists():
        for line in path.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k.startswith('FB_') and v})
    # fall back to the auto-posting dashboard's Page token (same ReSpecz page)
    if not (env.get('FB_PAGE_ID') and env.get('FB_PAGE_TOKEN')) and KIT_TOKEN_FILE.exists():
        kit = json.loads(KIT_TOKEN_FILE.read_text())
        env.setdefault('FB_PAGE_ID', kit.get('pageId'))
        if not env.get('FB_PAGE_ID'):
            env['FB_PAGE_ID'] = kit.get('pageId')
        if not env.get('FB_PAGE_TOKEN'):
            env['FB_PAGE_TOKEN'] = kit.get('pageToken')
    return env


def get(path, token, **params):
    params['access_token'] = token
    url = GRAPH + path.lstrip('/') + '?' + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors='replace')
        try:
            msg = json.loads(body)['error']['message']
        except Exception:
            msg = body[:300]
        raise RuntimeError(f'Graph API {e.code} on /{path}: {msg}') from None


def collect(edge, page_id, token, limit=60):
    """All videos from one edge (videos or video_reels), following paging up to `limit`."""
    out, after = [], None
    while len(out) < limit:
        params = {'fields': FIELDS, 'limit': 25}
        if after:
            params['after'] = after
        data = get(f'{page_id}/{edge}', token, **params)
        out += data.get('data', [])
        after = data.get('paging', {}).get('cursors', {}).get('after')
        if not after or not data.get('paging', {}).get('next'):
            break
    return out


def views(video_id, token):
    """Total plays. Reels and regular videos report it under different metric names; take whichever answers."""
    for metric in ('total_video_views', 'fb_reels_total_plays', 'blue_reels_play_count'):
        try:
            data = get(f'{video_id}/video_insights', token, metric=metric)
            for row in data.get('data', []):
                vals = row.get('values') or []
                if vals and isinstance(vals[0].get('value'), (int, float)):
                    return int(vals[0]['value'])
        except RuntimeError:
            continue
    return None


def save_thumb(video, token):
    """Largest thumbnail Facebook offers, saved locally."""
    url = video.get('picture')
    try:
        thumbs = get(f"{video['id']}/thumbnails", token, fields='uri,width,height,is_preferred').get('data', [])
        if thumbs:
            best = max(thumbs, key=lambda t: (t.get('is_preferred', False), t.get('width', 0) * t.get('height', 0)))
            url = best.get('uri') or url
    except RuntimeError:
        pass
    if not url:
        return None
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    dest = THUMB_DIR / f"{video['id']}.jpg"
    with urllib.request.urlopen(url, timeout=30) as r:
        dest.write_bytes(r.read())
    # shrink for the web (cards are at most ~300 px wide); macOS sips if present, else keep as is
    if shutil.which('sips'):
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '--resampleWidth', '540',
                        str(dest), '--out', str(dest)], capture_output=True)
    return f"assets/videos/{dest.name}"


def main():
    env = load_env()
    page_id, token = env.get('FB_PAGE_ID'), env.get('FB_PAGE_TOKEN')
    if not page_id or not token:
        sys.exit('Missing FB_PAGE_ID / FB_PAGE_TOKEN. Put them in .env.local (see the top of this file).')

    page = get(page_id, token, fields='name,link')
    videos = {}
    for edge in ('video_reels', 'videos'):
        try:
            for v in collect(edge, page_id, token):
                videos.setdefault(v['id'], v)
        except RuntimeError as e:
            print('warning:', e)
    if not videos:
        sys.exit('No videos returned. Check that the token is a Page token with pages_read_engagement.')

    items = []
    for v in videos.values():
        title = (v.get('title') or v.get('description') or '').strip().split('\n')[0][:90]
        items.append({
            'id': v['id'],
            'title': title or 'ReSpecz video',
            'url': v.get('permalink_url') if str(v.get('permalink_url', '')).startswith('http') else f"https://www.facebook.com{v.get('permalink_url', '')}",
            'created': v.get('created_time'),
            'length': round(v.get('length') or 0),
            'views': views(v['id'], token),
            # likes + comments: works with pages_read_engagement alone (views need read_insights)
            'engagement': (v.get('likes', {}).get('summary', {}).get('total_count') or 0)
                          + (v.get('comments', {}).get('summary', {}).get('total_count') or 0),
            '_raw': v,
        })

    latest = sorted(items, key=lambda x: x['created'] or '', reverse=True)[:PER_LIST]
    have_views = any(i['views'] for i in items)
    rank = (lambda x: x['views'] or 0) if have_views else (lambda x: x['engagement'])
    trending = sorted(items, key=rank, reverse=True)[:PER_LIST]
    if not have_views:
        print('note: no view counts (the token has no read_insights); Trending is ranked by likes + comments')
    for it in {i['id']: i for i in latest + trending}.values():
        it['thumb'] = save_thumb(it['_raw'], token)
    keep = {f"{i['id']}.jpg" for i in latest + trending}
    for old in THUMB_DIR.glob('*.jpg'):
        if old.name not in keep:
            old.unlink()
    clean = lambda lst: [{k: v for k, v in i.items() if k != '_raw'} for i in lst]

    OUT_JSON.write_text(json.dumps({
        'updated': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'page': {'name': page.get('name'), 'url': page.get('link')},
        'trending': clean(trending),
        'latest': clean(latest),
    }, ensure_ascii=False, indent=2) + '\n')
    print(f'wrote {OUT_JSON.relative_to(ROOT)}: {len(trending)} trending, {len(latest)} latest, from {len(items)} videos')


if __name__ == '__main__':
    main()
