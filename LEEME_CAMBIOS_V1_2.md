# Innov AI Shop V1.2 — diseño original restablecido

## Cambios visuales (solamente index.html y shop.html)
- Eliminados los grandes bloques añadidos: `seo-intro` (portada), `seo-about` (portada) y `seo-shop-intro` (catálogo).
- Se retiraron el panel con tres columnas y los botones nuevos de categorías encima del catálogo.
- Se mantiene el diseño de portada, catálogo, filtros, tarjetas, footer, modo oscuro/claro y navegación.
- El encabezado `Productos` del catálogo usa h1 semántico con estilo equivalente al antiguo h5, sin panel añadido.
- Se eliminó la etiqueta obsoleta `meta keywords` del catálogo.
- Se mantiene aviso de tienda independiente dentro de los Términos y condiciones existentes (no como bloque publicitario).

## SEO que se conserva
- Meta title, description, canonical, Open Graph/Twitter y JSON-LD.
- Cuatro páginas informativas de categorías, sitemap.xml y robots.txt.
- Las categorías son páginas independientes, NO listas de palabras escondidas. Pendiente integrarlas mejor al diseño principal.

## Importante
- Esto NO es una nueva estrategia integral SEO ni crea todavía URLs únicas para productos.
- No se modificaron JavaScript, funciones del carrito, Supabase, precios ni checkout frente a la V1.1.
- V1.1 incluía cambios de seguridad al checkout: siguen intactos.
- Si tu repositorio actual cambió desde la V1.1, haz merge y no sustituyas esos cambios nuevos.
- Primero publicar a rama de pruebas; confirmar las dos páginas y el proceso de compra antes de llevar a main.

## Despliegue más seguro
- Utiliza `InnovAIShop_V1_2_SOLO_DOS_HTML_2026-10-21.zip` si actualmente tienes exactamente la V1.1 publicada.
- Sube solamente `index.html` y `shop.html` al lugar equivalente en tu GitHub (no subas el ZIP como único archivo del sitio).
- Haz copia de seguridad y verifica modo claro, oscuro, escritorio y móvil.
- El ZIP completo V1.2 existe solo para quien necesita publicar toda la versión sin mezclar archivos.
