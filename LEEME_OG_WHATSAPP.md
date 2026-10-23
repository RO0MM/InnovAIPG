# Innov TIENDA — OG image para WhatsApp y redes

Diseño elegido: robot y perrito en una escena lunar, identidad INNOV TIENDA.

**Archivo:** `assets/og/innov-tienda-og-v1.jpg`  
**Resolución:** 1200 × 630 píxeles  
**Formato:** JPG progresivo optimizado  
**Uso:** vista previa de enlaces. No afecta al diseño visible, carrito ni Supabase.

## Opción A: solo cambiar metadatos sin sobrescribir el diseño actual (RECOMENDADA)

1. Haz copia del repositorio, y crea una rama de prueba.
2. Copia `assets/og/innov-tienda-og-v1.jpg` a esa misma ruta en tu repositorio.
3. Copia `instalar_og.py` junto a tu `index.html` y ejecútalo con `python instalar_og.py` (Python 3, sin dependencias).
4. Revisa el diff: el script solo modifica metadatos Open Graph y Twitter de las 7 páginas públicas que existan.
5. Confirma cambios y publica después de probarlos.

**Importante:** No cargues archivos de una versión antigua del sitio por encima de tu diseño nuevo. El script está pensado para trabajar sobre tu versión ACTUAL.

## Opción B: sin Python (manual)

En el `<head>` de `index.html`, `shop.html` y las páginas públicas que se compartan, reemplaza la etiqueta antigua `og:image` que apunta al logo, y sus metadatos de imagen por:

```html
<meta property="og:image" content="https://www.innovaishop.com/assets/og/innov-tienda-og-v1.jpg"/>
<meta property="og:image:secure_url" content="https://www.innovaishop.com/assets/og/innov-tienda-og-v1.jpg"/>
<meta property="og:image:type" content="image/jpeg"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="Innov Tienda: mascota robot y perrito juntos en un paisaje lunar."/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="https://www.innovaishop.com/assets/og/innov-tienda-og-v1.jpg"/>
```

Mantén los títulos (`og:title`), descripciones (`og:description`) y URLs (`og:url`) específicos de cada página.

## Después de publicar

1. Abre la imagen directamente en una ventana privada:
   https://www.innovaishop.com/assets/og/innov-tienda-og-v1.jpg
   Debe devolver una **imagen**, no HTML ni un error 404.
2. En el código fuente público de la página (`Ctrl+U`), confirma que `og:image` tiene la URL nueva y está en el HEAD, sin esperar JavaScript.
3. Usa https://developers.facebook.com/tools/debug/ para solicitar una nueva lectura de la página si la vista previa sigue antigua.
4. Comparte `https://www.innovaishop.com/` en un chat nuevo de WhatsApp y revisa el resultado. La plataforma decide el tamaño final de su tarjeta.
5. Si cambias el diseño en el futuro, usa otro nombre de archivo (`innov-tienda-og-v2.jpg`) para evitar cachés antiguos.

No se han realizado cambios al servidor, carrito, pagos ni Supabase. Una imagen OG correcta ayuda a mostrar la tarjeta, pero no garantiza que WhatsApp la presente en todos los casos.
