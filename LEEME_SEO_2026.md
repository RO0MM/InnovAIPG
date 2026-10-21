# Innov AI Tienda · primera mejora técnica SEO y seguridad (2026-10-21)

## Qué se mejoró
- Canonical consistente en `www` (dominio que la web pública devuelve tras la redirección).
- Metadatos de portada, tienda y contacto; Open Graph y Twitter con imagen local en vez de URL temporal de Facebook.
- Datos estructurados reales de negocio y sitio; SIN precios, estrellas ni stock inventados.
- H1, texto visible y enlaces rastreables en portada y tienda.
- Cuatro guías de categoría con enlaces al catálogo; los filtros `?category=` y búsquedas `?q=` se restauran desde URL.
- Sitemap con siete páginas públicas y robots.txt coherente; carrito/checkout/cuenta se marcan `noindex`.
- Favicon liviano.
- El checkout deja de pedir sesiones autenticadas de ChatGPT, incluso si existen requisitos obsoletos guardados en Supabase, y el admin deja de generar esa plantilla insegura.

## Publicación
1. Haz COPIA DE SEGURIDAD del proyecto publicado y confirma que este ZIP se corresponde con tu versión productiva actual (el ZIP original está fechado 2026-10-06).
2. Compara cambios y publica el CONTENIDO de la carpeta `InnovAIPG-main` en la raíz del sitio con tu método de despliegue (GitHub/Hostinger). No subas el ZIP entero como web.
3. Verifica `/`, `/shop.html`, `/contact.html`, las cuatro nuevas guías, `/sitemap.xml` y `/robots.txt`.
4. En carrito/checkout prueba un pedido de prueba SIN datos privados; verifica pago, supabase, stock y soporte.
5. En Search Console agrega y verifica la propiedad `https://www.innovaishop.com/`, envía el sitemap y consulta Inspección de URL. La indexación no es automática ni garantizada.
6. Inspecciona con Rich Results Test y Schema Markup Validator; confirma redirección 301 del dominio sin www.
7. Pide a quien administre Supabase que ELIMINE requisitos antiguos de texto de sesión y revise/borré todo dato de sesión previamente recibido, con política de conservación y respuesta ante incidentes.

## Pendiente antes de optimizar fichas por producto
Los detalles de productos siguen siendo modales `shop.html#p=...`. Para indexación confiable se necesitan rutas HTML únicas por producto, generadas desde catálogo público de Supabase con precio real, descripción honesta, disponibilidad y modo de acceso. Este ZIP no contiene un export verificable de productos vigentes ni la configuración de despliegue necesaria para automatizarlo sin errores. NO se generaron fichas engañosas con precios ficticios.

## Advertencias comerciales y de seguridad
- No pedir contraseñas, cookies, sesiones o tokens para activaciones. Si el método de suministro lo requiere, cambiar la modalidad del servicio.
- Revisar derechos de comercialización y los términos de cada proveedor, especialmente suscripciones personales/compartidas y licencias. Evitar atribuciones de afiliación oficial.
- Revisar el catálogo de reserva incrustado en `js/shop-app.js`: hay una ficha denominada “DOX CEO” con descripciones relacionadas con obtención de datos personales y spam. No publicarla ni promocionarla; evaluar su eliminación del catálogo y del código por cumplimiento y protección de usuarios.
- Consultar normas peruanas de comercio electrónico, privacidad y atención al consumidor según las actividades reales.
- No se tuvo acceso a Google Search Console, datos privados de Supabase, analítica web ni pruebas reales de compra.
- No modificar el catálogo vivo o la base de datos sin revisar respaldos y derechos de acceso.

## Lista de pruebas técnicas
- Página raíz muestra encabezado H1 antes de consultar Supabase.
- En `/shop.html?q=canva` se rellena búsqueda inicial; `?category=ai` filtra categoría IA.
- `/streaming.html` y otros destinos devuelven `200`, canonicals a `www`.
- En checkout no se solicita contenido `api/auth/session` ni tokens.
- Robots y sitemap accesibles con servidor, no solo archivos locales.
- Meta social al compartir en WhatsApp; revisar aspecto de la imagen.
- Redirección consistente de `http`, `https`, `www` y no `www`.

## Qué no se hizo
- No se cambió Supabase, RLS, tablas ni funcionalidad de pagos.
- No se implementó SSR ni URLs individuales de cada producto.
- No se editó la web publicada; estos son archivos listos para REVISAR y publicar.
- No se afirma ni garantiza recomendación/posición en Google, ChatGPT o Gemini.

## Nota sobre catálogo local
Se eliminó la ficha de respaldo denominada “DOX CEO” del código local por anunciar obtención de información de terceros y ataques de spam. No se modificó Supabase, de modo que si esa ficha figura en el catálogo publicado debe desactivarse desde administración.
