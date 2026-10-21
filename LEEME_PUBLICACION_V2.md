# Innov AI Shop V2 — Optimización integral, sin alterar el diseño

**Fecha:** 21/10/2026  
**Base:** V1.2 que restauró el diseño oscuro de la tienda.

## Qué se corrigió en el código (confirmado por comparación)

1. **Tarjetas de tienda sin rectángulos negros de video.** Se detiene la incrustación automática de iframes y videos encima de las miniaturas del catálogo. Se conservan las imágenes de cada producto y el video sigue disponible en la ventana de información.
2. **Portada más ligera.** Las promociones pequeñas usan la imagen en vez de iniciar varios reproductores; el video principal se conserva. Se respeta la preferencia de movimiento reducido del navegador.
3. **Stock sin mensajes contradictorios.** Ya no debe aparecer `Disponible · 0 cupos` por un plan manual o bajo pedido; se informa `Disponible bajo pedido`, `Consultar disponibilidad`, `Disponible`, o cupos positivos, según la modalidad. No se cambió el permiso real de venta/stock del servidor.
4. **Páginas orgánicas con la misma identidad visual.** Las cuatro páginas de categorías ahora usan fondos y tarjetas oscuros, color de acento amarillo y texto legible, sin introducir cajas blancas en la tienda.
5. **URLs canónicas unificadas.** Carrito y checkout se ajustan a `https://www.innovaishop.com`. No se indexan las páginas privadas.
6. **Mejora de la llegada a WhatsApp.** Durante el horario de atención no se obliga al usuario a pasar por la ventana de horarios; fuera del horario sigue apareciendo la confirmación si esa opción está activa.
7. **Protecciones adicionales de activación.** Los campos configurados para recopilar contraseñas, OTP o tokens de sesión se detectan y descartan más estrictamente en la interfaz. **Las reglas SQL y datos históricos siguen pendientes de auditoría en Supabase.**
8. **Catálogo de respaldo sin ventas falsas.** Cuando la consulta pública falla, los productos locales se muestran solo como referencia y no pueden entrar en un checkout que exige plan_id de Supabase. El estado para el cliente deja de mencionar errores técnicos internos.
9. **Medición preparada, no activada sin consentimiento.** `js/innov-metrics.js` instrumenta eventos locales `view_item`, `add_to_cart`, `begin_checkout`, `generate_lead` y `payment_info_submitted`. **No envía datos externos ni cookies por defecto.** Para activar GA4 hay que configurar un ID real y ofrecer consentimiento válido de analítica. Nunca se registra `purchase` al crear un pedido o enviar un pago a revisión.
10. **Generador SEO de fichas reales.** `scripts/generate_product_pages.py` genera páginas `/productos/*.html` y actualiza `sitemap.xml` a partir de la RPC pública `get_public_catalog` y no inventa precios, valoraciones o disponibilidad. **No se ha ejecutado contra el catálogo real; las fichas no están incluidas en V2 hasta que se suministren los datos actuales.**
11. **Control de caché.** Se versionaron URL de los JS/CSS modificados para ayudar a recibir los cambios tras actualizar la web. Si el hosting sirve HTML viejo, vaciar su caché/CDN.

## Qué NO se cambió

- Diseño base de portada, colores originales, tarjetas, filtros y carrito.
- Contratos de RPC de pedidos, tablas, RLS, pagos, QR Yape, Supabase Realtime ni administrador.
- Precios reales, stock comercial ni modalidades de los planes almacenados en Supabase.
- Dominio y hosting; no se publicó ni se alteró tu repositorio GitHub.
- No se agregaron cajas con keywords ni textos ocultos para manipular Google.

## Verificaciones completadas

- Sintaxis `node --check` de los 23 archivos JS.
- Todos los enlaces locales de HTML, incluidos los nombres URL-encoded.
- JSON-LD de todos los HTML y XML de `sitemap.xml`.
- Generador SEO con datos ficticios de prueba: escapado de HTML y actualización del sitemap.
- Comparación con el ZIP V1.2, sin eliminación de archivos previos.
- No se pudieron hacer pruebas visuales automatizadas en Chromium: el navegador del entorno bloqueó conexiones locales. Tampoco compras reales ni evaluación de PageSpeed.

## Para subir sin arriesgar tu web

1. **Crea una copia de seguridad de `main` y de lo desplegado.**
2. Compara el ZIP `PATCH` con los archivos presentes en GitHub; **no sobrescribas cambios nuevos** que no estén en la versión V1.2.
3. Crea una rama `innova-optimizacion-v2`, incorpora los archivos conservando la estructura de carpetas, y revisa su vista previa si el hosting admite staging.
4. Revisa en escritorio y móvil: portada, tienda, miniaturas, consulta de plan, stock 0, cambiar moneda, filtros, carrito, formulario y pedido de prueba sin transferir dinero, cancelación, inicio de sesión, admin y WhatsApp.
5. Asegúrate de que una activación de ChatGPT no requiera contraseña, código OTP, cookies o token. Confirma los requisitos guardados en las tablas de Supabase.
6. Si todo es correcto, integra a `main`; luego prueba las URLs públicas, purga caché del hosting si corresponde y solicita rastreo en Search Console.
7. Si hay errores, revierte el commit de V2 y conserva la base de datos intacta.

## Para convertir SEO y analítica en herramientas activas

### SEO de cada producto
La generación requiere ejecutar `python scripts/generate_product_pages.py --live` en un entorno con acceso a Internet para obtener la RPC **pública y de solo lectura**. Este paso generará `/productos/*.html` y las URLs del sitemap. Se deben publicar juntos y repetir al actualizar productos. Verifica si la RPC devuelve planes que realmente estén publicados; no incluyas categorías prohibidas o servicios cuya comercialización no esté autorizada.

### Google Search Console
Verifica la propiedad `https://www.innovaishop.com/`, envía `https://www.innovaishop.com/sitemap.xml` y revisa la pestaña de páginas indexadas. No tenemos acceso al informe real, así que no existe una cifra verificable de indexación.

### Analytics
`js/analytics-settings.js` tiene el ID de GA4 vacío intencionadamente. **No pongas un ID cualquiera.** Antes de activar GA4 implementa un control real de consentimiento informado y actualiza tus avisos de privacidad; el estado debe poder revocarse. La nueva integración nunca captura nombre, teléfono, correo, ID de pedido, contraseñas ni sesión autenticada. Las métricas de pedido creado y pago enviado son **leads**, no pagos confirmados.

### Seguridad y operación
Sin acceso a RLS/RPC, reglas SQL, logs, hosting ni pagos reales no es posible certificar un 10/10. Asegura controles de stock y precio en el servidor, antiabusos en pedidos y códigos, políticas de terceros y datos correctos de comercio. La clave `sb_publishable_...` es pública por diseño; nunca se debe poner `service_role` ni secretos en HTML.

## Pruebas obligatorias antes de declarar 10/10
- Función real de carrito, orden, pago, entrega y soporte.
- `get_public_catalog` con productos actuales y stock real.
- Chrome/Android/iOS con capturas en ambos temas.
- PageSpeed Insights móvil (LCP, INP, CLS) y auditoría de accesibilidad.
- Search Console y Rich Results Test por páginas de producto.
- Revisión de seguridad del backend Supabase y métodos de activación.
- Validación de marcas, licencias, garantías, Libro de Reclamaciones y políticas conforme al negocio en Perú.

**Resultado:** versión técnica más sólida y prudente, pero NO certificada como 10/10 en producción.
