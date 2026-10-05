/* module: inline */
const SUPABASE_URL = "https://rfjvskrimsoqlyofhidj.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_P1cgsqPGMWHHWIujJayyqg_9hgJEXZh";

    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });

    const params = new URLSearchParams(location.search);
    const requestToken = params.get("token");

    const msg = document.getElementById("msg");
    const btn = document.getElementById("btnLogin");

    function show(text, type = "") {
      msg.textContent = text;
      msg.className = "msg " + type;
    }

    if (!requestToken) {
      show("Esta página debe abrirse desde el botón /login del bot de Telegram. Por ahora falta el token.", "bad");
    }

    btn.addEventListener("click", async () => {
      try {
        if (!requestToken) {
          show("Falta el token de Telegram. Vuelve al bot y escribe /login otra vez.", "bad");
          return;
        }

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        if (!email || !password) {
          show("Completa correo y contraseña.", "bad");
          return;
        }

        btn.disabled = true;
        btn.textContent = "Validando...";
        show("Iniciando sesión con Supabase...");

        const { data, error } = await sb.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          show("Correo o contraseña incorrectos.", "bad");
          return;
        }

        const accessToken = data.session && data.session.access_token;

        if (!accessToken) {
          show("No se obtuvo una sesión válida. Intenta nuevamente.", "bad");
          return;
        }

        show("Sesión correcta. Vinculando Telegram...");

        const res = await fetch(`${SUPABASE_URL}/functions/v1/telegram-auth-link`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            request_token: requestToken,
            device_label: navigator.userAgent
          })
        });

        const linkData = await res.json();

        if (!linkData.ok) {
          show(linkData.error || "No se pudo vincular Telegram.", "bad");
          return;
        }

        show(
          `Telegram vinculado correctamente.\nCorreo: ${linkData.email}\n\nAhora vuelve al bot y escribe /estado.`,
          "ok"
        );

      } catch (e) {
        show("Error: " + e.message, "bad");
      } finally {
        btn.disabled = false;
        btn.textContent = "Iniciar sesión y vincular";
      }
    });
