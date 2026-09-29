"""Build poweredbycortex.ae/exostan/ from exostan.html: external CSS and JS (CSP-safe), Supabase backend."""
import re, pathlib, shutil
root = pathlib.Path('/home/claude')
out = root/'poweredbycortex-ae'/'site'/'exostan'
out.mkdir(parents=True, exist_ok=True)
src = (root/'exostan.html').read_text()
API = 'https://hfhxqreljzpmyujehrlj.supabase.co/functions/v1/exostan'

shim = (root/'exostan-edge'/'build.py').read_text()
shim = shim[shim.index('SHIM = r"""')+len('SHIM = r"""'):]
shim = shim[:shim.index('"""')]
shim_js = re.search(r'<script>\n(.*?)</script>', shim, re.S).group(1)
shim_js = shim_js.replace("const BASE = location.pathname.replace(/\\/+$/,'');", "const BASE = '%s';" % API)
assert "const BASE = 'https://" in shim_js

style = re.search(r'<style>\n(.*?)</style>', src, re.S).group(1)
main_js = re.search(r'<script>\n(\(function\(\)\{\n"use strict";.*)</script>', src, re.S).group(1)
body = src[src.index('<div class="wrap">'):src.index('<script>\n(function(){\n"use strict";')]

html = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex,nofollow"><title>Exostan</title>'
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">'
        '<link rel="stylesheet" href="/exostan/exostan.css">'
        '<script src="/exostan/jspdf.umd.min.js" defer></script>'
        '<script src="/exostan/exostan.js" defer></script>'
        '</head><body>\n' + body.strip() + '\n</body></html>\n')
(out/'index.html').write_text(html)
(out/'exostan.css').write_text('html,body{margin:0;padding:0}\n' + style)
(out/'exostan.js').write_text('/* Exostan, powered by Cortex. Backend: Supabase edge function. */\n' + shim_js + '\n' + main_js)
jspdf = root/'poweredbycortex-ae'/'site'/'exostan'/'jspdf.umd.min.js'
cand = list(pathlib.Path('/tmp/claude-0').rglob('node_modules/jspdf/dist/jspdf.umd.min.js'))
assert cand, 'jspdf not found'
shutil.copy(cand[0], jspdf)
print('written', [p.name for p in out.iterdir()], 'js bytes', len((out/'exostan.js').read_text()))
