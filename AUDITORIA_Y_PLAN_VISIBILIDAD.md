# Reanálisis SEO + visibilidad en IA — Innov AI Tienda

**Fecha de revisión:** 21/10/2026
**Fuentes:** ZIP `InnovAIPG-main (4).zip` con archivos fechados 06/10/2026 y vistas públicas `https://www.innovaishop.com/` y `https://www.innovaishop.com/shop.html`.
**Alcance:** análisis estático de proyecto, inspección de HTML público disponible e implementación de primer paquete de mejoras. Sin Search Console, Analytics, datos en producción de Supabase, accesos a hosting ni validación completa de pagos.

## Hallazgos por prioridad

| Prioridad | Área | Evidencia | Acción de esta versión | Pendiente |
|---|---|---|---|---|
| Crítica | Seguridad clientes | `js/checkout-app.js` y `js/admin.js` pedían la sesión autenticada de ChatGPT | Se retiran plantillas de esa solicitud y se filtran requisitos históricos de la interfaz | Borrar/rotar credenciales antiguas si se recibieron; revisar el backend y el procedimiento de activación autorizado |
| Crítica | Comercio responsable | Código local de respaldo de tienda tenía ficha de 'DOX CEO' que anunciaba spam y obtención de datos personales | Se retira dicha ficha del catálogo de respaldo | Despublicar cualquier ficha análoga desde Supabase y revisar cumplimiento y moderación de productos |
| Alta | Rastreo | HTML inicial muestra 'Actualizando destacados' y 'Cargando catálogo' antes de JS | Se añade contexto semántico, H1 y texto enlazado | Pre-renderizado/SSR de fichas reales desde Supabase |
| Alta | Rutas de producto | `shop.html#p=...` no es ficha canónica por producto | Se crean landings indexables de categorías | URL HTML propia por cada servicio legítimo publicado; generarlas automáticamente desde catálogo |
| Alta | Canonical | Sitio público redirige no-www a www; ZIP canonicals eran no-www | Normalización de canonicals y sitemap | Confirmar encabezados HTTP 301 permanentes con el hosting |
| Alta | Metadatos | Inicio title/description genéricos, tienda con URL de imagen Facebook expirable | Nuevos títulos, descriptions y Open Graph | Test de vista previa social tras despliegue |
| Media | Datos estructurados | Falta schema JSON-LD válido y veraz en HTML inicial | `OnlineStore`/`WebSite` y breadcrumbs por página | `Product`/`Offer` verificables por ficha real, sin inventar stock/precio |
| Media | Marca/confianza | Pocos contenidos públicos independientes de JS | Guías de IA, diseño, streaming y herramientas; mensajes de compra prudentes | Información fiscal/comercial real, garantías claras, política de reembolso conforme a normativa |
| Media | Velocidad | Logo original ~424 KB para favicon; videos y recursos externos | Favicon optimizado, sin alterar logo principal | Medir LCP/INP/CLS en PageSpeed Insights y optimizar thumbnails para video |
| Media | Accesibilidad | H1 inicial ausente en HTML de página principal | Encabezado visible y navegación por categorías | Revisar contraste/modales/lectores de pantalla y formularios con pruebas automáticas/manuales |
| Media | Control indexación | `robots.txt` bloquea cart/checkout sin noindex visibles | Meta robots noindex en páginas privadas y reglas simples | Verificar respuesta de la CDN/cortafuegos a robots, no indexar datos privados |

## Estrategia por canal

### Google Search / Google AI Mode
- Verificar dominio en **Google Search Console**; solicitar rastreo de URLs y sitemap, medir impresiones, clics, consultas y páginas indexadas.
- Publicar fichas individuales de productos reales con nombre, duración, modalidad de acceso, condiciones, imágenes licenciadas, precio y disponibilidad vigentes.
- Publicar contenido original que responda preguntas concretas de compradores peruanos; evitar listas de palabras clave repetidas.
- No añadir opiniones/estrellas ficticias ni prometer 'Top 1'.

### Bing / Copilot / ecosistema Microsoft
- Verificar web en Bing Webmaster Tools y enviar `sitemap.xml`.
- Preparar IndexNow solo cuando el hosting permita poner la clave y automatizar URLs; no incluye clave falsa.

### ChatGPT Search
- Permitir acceso público a `OAI-SearchBot` y revisar que el hosting/cortafuegos no devuelva 403 a rastreadores legítimos.
- Medir visitas con `utm_source=chatgpt.com` en Analytics, cuando se configure.
- Aportar información factual y accesible de precios reales, atención, condiciones y página pública por producto; ninguna táctica obliga al sistema a recomendar un negocio.

### Gemini y otros sistemas
- Priorizar contenido público indexable, URLs estables y entidad de marca coherente en web y redes.
- Comparativas y FAQ únicas y verificadas, sin copiar explicaciones genéricas de terceros.

### Seguridad, legitimidad y experiencia de compra
- Revisar si hay autorización para vender/activar cada producto, especialmente cuentas personales, software con licencias nominativas o compartidas.
- No solicitar ni almacenar contraseñas, cookies, códigos de un solo uso ni tokens.
- Mejorar información de razón social, políticas reales y contacto verificable; no inventar RUC, dirección comercial ni reseñas.
- Probar personalmente flujo: landing → búsqueda → detalle → carrito → checkout → orden → activación → soporte.

## Indicadores por los que evaluar la mejora

**Primeras semanas:** URLs válidas rastreadas/indexadas, errores de Search Console, errores 404/canonical y rich results válidos.

**Mediano plazo:** consultas comerciales no de marca, clics orgánicos, tráfico desde Google/Bing/ChatGPT, conversiones, tasa de carrito a orden, contacto por WhatsApp y recurrencia de soporte.

**Confiabilidad:** ninguna activación solicita secretos; no se anuncian servicios ilícitos, prohibidos por proveedor o con procedencia no acreditada.

## Bloqueadores reales de la segunda fase

1. Acceso a catálogo de productos publicados de Supabase o export de RPC `get_public_catalog` con la estructura de datos real. Los precios de ejemplos codificados no representan el stock de producción.
2. Definición de dónde se despliega la web y cómo servir URLs de producto con HTTP 200, canonicals y 404 reales.
3. Acceso de lectura a Search Console/Bing Webmaster/Analytics para priorizar y medir.
4. Verificación de permisos de distribución, marca, garantías y procesos de activación ofrecidos.

## Fuentes oficiales de referencia

- Google Search Central, **JavaScript SEO basics**: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google Search Central, **Product structured data**: https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- Google Search Central, **AI features and your website**: https://developers.google.com/search/docs/appearance/ai-features
- Google Search Central, **Guide to optimizing for generative AI**: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- OpenAI, **Publisher FAQs**: https://help.openai.com/en/articles/12627856
- Bing Webmaster, **Sitemaps**: https://www2.bing.com/webmasters/help/sitemaps-3b5cf6ed

**Nota:** Esta versión no está publicada en el dominio ni constituye una auditoría de seguridad de Supabase, servidor o infraestructura. Validar en ambiente de prueba antes de actualizar producción.
