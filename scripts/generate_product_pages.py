#!/usr/bin/env python3
"""Genera fichas indexables desde la RPC pública de Supabase. No inventa productos."""
import argparse, html, json, re, urllib.request
from pathlib import Path
from urllib.parse import quote
import xml.etree.ElementTree as ET
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.innovaishop.com"
RPC = "https://rfjvskrimsoqlyofhidj.supabase.co/rest/v1/rpc/get_public_catalog"
KEY = "sb_publishable_P1cgsqPGMWHHWIujJayyqg_9hgJEXZh"
CATS = {
 "ai": ("Inteligencia artificial", "inteligencia-artificial.html"),
 "streaming": ("Streaming", "streaming.html"),
 "musica": ("Diseño y edición", "diseno-y-edicion.html"),
 "otros": ("Herramientas digitales", "herramientas-digitales.html")
}
def escape(value):
    return html.escape(str(value if value is not None else ""), quote=True)
def slug(value):
    text = ''.join(c for c in unicodedata.normalize('NFKD', str(value or "").lower()) if not unicodedata.combining(c))
    return re.sub('[^a-z0-9]+', '-', text).strip('-')[:85]
def fetch():
    request = urllib.request.Request(RPC,data=b'{}',method="POST",
      headers={"Content-Type":"application/json","apikey":KEY,"Authorization":"Bearer "+KEY})
    with urllib.request.urlopen(request, timeout=25) as response:
        result = json.load(response)
    if not isinstance(result,list): raise ValueError("La RPC pública no devolvió una lista")
    return result
def summarize(rows):
    products = {}
    for row in rows:
        if not isinstance(row,dict) or not row.get('product_name'): continue
        raw = row.get('product_slug') or row.get('product_id')
        if not raw: continue
        key=slug(raw)
        if not key: continue
        p=products.setdefault(key, {
          'slug': key, 'id':str(raw), 'name':str(row['product_name']),
          'description':str(row.get('product_description') or '').strip(),
          'image':str(row.get('image_url') or ''), 'category':str(row.get('category') or 'otros'),
          'plans':set()})
        if row.get('plan_name'):
            p['plans'].add((str(row['plan_name']),str(row.get('period') or '')))
    return sorted(products.values(),key=lambda p:p['name'].casefold())
def render(p):
    name=p['name']; cat,cat_url=CATS.get(p['category'],CATS['otros'])
    desc=p['description'] or f"Revisa modalidades y condiciones actuales de {name} en Innov AI Tienda."
    desc=desc[:600]
    meta=(desc[:151] + "…") if len(desc)>154 else desc
    canonical=f"{BASE}/productos/{p['slug']}.html"
    dest=f"../shop.html#p=db-{quote(p['id'],safe='')}"
    structured={'@context':'https://schema.org','@type':'Product','name':name,'description':desc,'url':canonical}
    if p['image'].startswith('https://'):structured['image']=p['image']
    script=json.dumps(structured,ensure_ascii=False).replace('</','<\\/')
    media=(f'<img class="product-thumb" loading="lazy" src="{escape(p["image"])}" alt="{escape(name)}">'
       if p['image'].startswith('https://') else '')
    plans=''.join(f'<li>{escape(n)}{" — "+escape(t) if t else ""}</li>' for n,t in sorted(p['plans'])[:20])
    plans_section=(f'<article class="card"><h2>Planes anunciados</h2><ul>{plans}</ul></article>' if plans else '')
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(name)} en Perú | Innov AI Tienda</title>
<meta name="description" content="{escape(meta)}"><meta name="robots" content="index,follow">
<link rel="canonical" href="{escape(canonical)}">
<meta property="og:type" content="product"><meta property="og:title" content="{escape(name)}">
<meta property="og:description" content="{escape(meta)}"><meta property="og:url" content="{escape(canonical)}">
<meta property="og:site_name" content="Innov AI Tienda">
<meta property="og:locale" content="es_PE">
<meta property="og:image" content="https://www.innovaishop.com/assets/og/innov-tienda-og-v2.jpg">
<meta property="og:image:secure_url" content="https://www.innovaishop.com/assets/og/innov-tienda-og-v2.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Innov AI Tienda, robot dorado y perrito en paisaje lunar">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{escape(name)} en Perú | Innov AI Tienda">
<meta name="twitter:description" content="{escape(meta)}">
<meta name="twitter:image" content="https://www.innovaishop.com/assets/og/innov-tienda-og-v2.jpg">
<link rel="icon" href="../assets/img/favicon-64.png">
<link rel="stylesheet" href="../css/seo-pages.css">
<script type="application/ld+json">{script}</script></head>
<body><header><a href="../index.html">✦ INNOV TIENDA</a>
<nav><a href="../index.html">Inicio</a><a href="../shop.html">Catálogo</a><a href="../contact.html">Contacto</a></nav></header>
<main><nav aria-label="Ruta de navegación"><a href="../index.html">Inicio</a> › <a href="../{escape(cat_url)}">{escape(cat)}</a> › {escape(name)}</nav>
<p class="eyebrow">Innov AI Tienda · Perú</p><h1>{escape(name)}</h1>
<div class="card">{media}<p class="lead">{escape(desc)}</p>
<p>Precio, vigencia y disponibilidad son dinámicos: consulta la ficha actual antes de pagar.</p>
<a class="cta" href="{escape(dest)}">Ver precio vigente y elegir plan</a></div>
{plans_section}
<article class="card"><h2>Antes de elegir</h2>
<p>Consulta la duración, la modalidad de acceso, las condiciones del proveedor y la garantía del plan. Nunca compartas contraseñas, cookies ni tokens.</p></article>
<p class="subtle">Tienda independiente, sin afiliación oficial implícita con marcas de terceros.</p>
<p><a href="../contact.html">Contacto y soporte</a></p></main>
<footer>Innov AI Tienda · Perú · <a href="../index.html?open=privacy">Privacidad</a></footer>
</body></html>"""
def generate(rows, output, sitemap):
    products=summarize(rows)
    if not products: raise ValueError('Catálogo vacío; no se reemplazan fichas ni sitemap existentes')
    output.mkdir(parents=True,exist_ok=True)
    for old in output.glob('*.html'):old.unlink()
    for p in products:(output/(p['slug']+'.html')).write_text(render(p),encoding='utf-8')
    ns='http://www.sitemaps.org/schemas/sitemap/0.9'
    ET.register_namespace('',ns)
    tree=ET.parse(sitemap); base=tree.getroot()
    for element in list(base):
        loc=element.find('{'+ns+'}loc')
        if loc is not None and loc.text and '/productos/' in loc.text:base.remove(element)
    for p in products:
        el=ET.SubElement(base,'{'+ns+'}url')
        ET.SubElement(el,'{'+ns+'}loc').text=f"{BASE}/productos/{p['slug']}.html"
    ET.indent(tree,space='  ')
    tree.write(sitemap,encoding='utf-8',xml_declaration=True)
    return len(products)
if __name__=="__main__":
    parser=argparse.ArgumentParser()
    source=parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input",help="JSON público exportado de get_public_catalog")
    source.add_argument("--live",action="store_true",help="consulta en vivo (requiere internet)")
    parser.add_argument("--output",default=str(ROOT/"productos"))
    parser.add_argument("--sitemap",default=str(ROOT/"sitemap.xml"))
    args=parser.parse_args()
    data=fetch() if args.live else json.loads(Path(args.input).read_text(encoding='utf-8'))
    print(f"Se generaron {generate(data,Path(args.output),Path(args.sitemap))} fichas SEO. Publicar junto al sitemap.")
