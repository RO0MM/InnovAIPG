#!/usr/bin/env python3
# Integrador OG para Innov Tienda. Conserva la estructura y diseño actual.
from pathlib import Path
import re
OG_URL = "https://www.innovaishop.com/assets/og/innov-tienda-og-v1.jpg"
ALT = "Innov Tienda: mascota robot y perrito juntos en un paisaje lunar, con la identidad dorada de la marca."
PAGES = ("index.html", "shop.html", "contact.html", "inteligencia-artificial.html", "diseno-y-edicion.html", "streaming.html", "herramientas-digitales.html")
def patch(text):
    m=re.search(r"<head(?:\s[^>]*)?>.*?</head>",text,flags=re.I|re.S)
    if not m: raise ValueError("No se encontró <head>")
    head=m.group(0)
    for prop in ("og:image", "og:image:url", "og:image:secure_url", "og:image:type", "og:image:width", "og:image:height", "og:image:alt"):
        head=re.sub(r"<meta\b(?=[^>]*\bproperty\s*=\s*['\"]"+re.escape(prop)+r"['\"])[^>]*>[ \t]*\n?", "", head, flags=re.I|re.M)
    for name in ("twitter:image", "twitter:image:alt"):
        head=re.sub(r"<meta\b(?=[^>]*\bname\s*=\s*['\"]"+re.escape(name)+r"['\"])[^>]*>[ \t]*\n?", "", head, flags=re.I|re.M)
    head,n=re.subn(r"(<meta\b(?=[^>]*\bname\s*=\s*['\"]twitter:card['\"])[^>]*\bcontent\s*=\s*['\"])[^'\"]*(['\"][^>]*>)",r"\1summary_large_image\2",head,flags=re.I)
    tags=(
      f'<meta property="og:image" content="{OG_URL}"/>\n'
      f'<meta property="og:image:secure_url" content="{OG_URL}"/>\n'
      '<meta property="og:image:type" content="image/jpeg"/>\n'
      '<meta property="og:image:width" content="1200"/>\n'
      '<meta property="og:image:height" content="630"/>\n'
      f'<meta property="og:image:alt" content="{ALT}"/>\n'
      f'<meta name="twitter:image" content="{OG_URL}"/>\n'
      f'<meta name="twitter:image:alt" content="{ALT}"/>\n')
    if not n: tags+='<meta name="twitter:card" content="summary_large_image"/>\n'
    head=re.sub(r"</head>",lambda m:tags+m.group(0),head,flags=re.I,count=1)
    return text[:m.start()]+head+text[m.end():]

def main():
    root=Path(__file__).resolve().parent
    if not (root/'index.html').exists():
      raise SystemExit("Coloca instalar_og.py en la raíz del repositorio, junto a index.html, y ejecútalo ahí.")
    img=root/'assets/og/innov-tienda-og-v1.jpg'
    if not img.is_file():
      raise SystemExit("Falta assets/og/innov-tienda-og-v1.jpg")
    for name in PAGES:
      p=root/name
      if not p.exists():continue
      old=p.read_text(encoding='utf-8')
      new=patch(old)
      if new!=old:
        p.write_text(new,encoding='utf-8')
        print("Actualizado:",name)
      else: print("Sin cambios:",name)
    print("Listo. Revisa 'git diff' y prueba la imagen antes de hacer commit.")
if __name__=='__main__':main()
