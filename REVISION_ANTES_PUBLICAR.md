# Comprobación previa de despliegue – Innov AI Shop SEO V1.1

## Qué se ha comprobado
- Se comparó archivo a archivo con el ZIP de origen (61 archivos originales). No se pretendió sustituir la lógica de pagos, conexión a Supabase, cuenta de usuario o carrito.
- Se detectó y corrigió un error de empaquetado: la imagen `Diseño sin título.png` se había renombrado y `codigo.html` no habría podido encontrarla. Se restituyó el nombre y el contenido originales.
- Se verificó sintaxis estática de los 21 archivos JavaScript con `node --check`.
- Se verificó que los enlaces a recursos locales utilizados por HTML tengan archivos presentes en el ZIP.
- Se verificó XML válido en sitemap y JSON sintácticamente válido en bloques JSON-LD.

## Lo que NO se ha podido comprobar
- Compras de prueba con Supabase real, generación de pedidos, recepción de pagos, stock y fidelidad de datos en producción.
- Funcionamiento con la revisión del repositorio GitHub actualmente desplegada, que puede ser posterior al ZIP original fechado el 06/10/2026.
- Requisitos de los procedimientos almacenados `create_public_order_v2` y otros RPC: podrían requerir ajustes de backend frente a los cambios de datos de activación.
- Experiencia visual real en todos los navegadores, móviles y dimensiones.
- Indexación, visibilidad y posicionamiento de Google o buscadores de IA después de publicar.

## Antes de usar en producción
1. Hacer copia del estado actual de la rama principal y del hosting.
2. Crear una rama nueva (`mejoras-seo-v1`) y comparar contra la web en uso; NO reemplazar el contenido de `main` sin revisar el diff.
3. Verificar en vista previa todas las páginas, carrito, panel admin, login, historial de pedidos y creación/confirmación de compra con datos de prueba.
4. En particular, asegurarse de que backend/Supabase no exija campos antiguos que pedían contenido de sesión de ChatGPT.
5. Publicar recién después de pruebas y conservar una vía de reversión inmediata.

La evidencia de sintaxis y referencias estáticas NO equivale a una garantía de funcionamiento en producción. La publicación no se ha realizado.
