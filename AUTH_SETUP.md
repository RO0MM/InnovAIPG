# Configuración de autenticación — Innov Tienda

El código del sitio ya queda preparado. Las siguientes configuraciones se realizan **una sola vez** en Supabase/Google porque no deben guardarse secretos dentro del HTML.

## 1) Login público con Google

En Supabase: **Authentication → Providers → Google**.

1. Crea un cliente OAuth tipo **Web application** en Google Auth Platform / Google Cloud.
2. Registra el dominio público de Innov Tienda como JavaScript origin.
3. Usa en Google la URL de callback que Supabase muestra en el proveedor Google.
4. Copia Client ID y Client Secret en el proveedor Google de Supabase y actívalo.
5. En **Authentication → URL Configuration**, configura `Site URL` con tu dominio y agrega `https://TU-DOMINIO/login.html` a Redirect URLs.

El frontend utiliza `supabase.auth.signInWithOAuth({ provider: 'google' })`.

## 2) Verificación de correo por código

En **Authentication → Email Templates → Confirm signup**, cambia la plantilla para mostrar el OTP. Ejemplo:

```html
<h2>Verifica tu correo</h2>
<p>Tu código de Innov Tienda es:</p>
<p style="font-size:32px;font-weight:800;letter-spacing:8px">{{ .Token }}</p>
<p>Si no creaste esta cuenta, ignora este mensaje.</p>
```

La pantalla pública usa `verifyOtp({ email, token, type: 'email' })`.

## 3) Recuperación pública por código de correo

En **Authentication → Email Templates → Reset password**, muestra también `{{ .Token }}`. Ejemplo:

```html
<h2>Recupera tu cuenta</h2>
<p>Tu código de recuperación es:</p>
<p style="font-size:32px;font-weight:800;letter-spacing:8px">{{ .Token }}</p>
<p>El código caduca según la configuración de Auth.</p>
```

La página también soporta el flujo por enlace de recuperación de Supabase.

## 4) Recuperación ADMIN por Telegram

1. Ejecuta `supabase/migrations/20260903_admin_recovery.sql` en SQL Editor.
2. Despliega `supabase/functions/admin-recovery/index.ts` como Edge Function llamada **admin-recovery**.
3. Configura estos secretos de la función:
   - `TELEGRAM_BOT_TOKEN` = token del bot (solo servidor).
   - `TELEGRAM_RECOVERY_CHAT_ID` = chat que recibirá códigos. Si no existe, usa `TELEGRAM_CHAT_ID`.
   - `ADMIN_RECOVERY_PEPPER` = cadena aleatoria larga (32+ caracteres).
   - `ALLOWED_ORIGIN` = `https://TU-DOMINIO` (recomendado en producción).
   - `SUPABASE_SERVICE_ROLE_KEY` debe permanecer únicamente en Edge Functions/servidor.
4. La cuenta debe existir en Supabase Auth y estar activa en `public.admin_users`.

La función aplica: código de 6 dígitos, expiración 10 minutos, 5 intentos máximos, un solo uso y cooldown de 60 segundos.

## 5) Qué NO debes subir al repositorio público

- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_RECOVERY_PEPPER`
- Client Secret de Google

La `sb_publishable_...` que usa el navegador sí es una clave pública; la seguridad real debe mantenerse con RLS y validaciones de servidor.
