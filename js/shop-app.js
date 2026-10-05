/* module: inline */
(function(){
    /* ================== Config ================== */
    const FX = 3.70;              // 1 USD = 3.70 S/
    const PAGE_SIZE = 16;         // cards pequeñas
    // Sin polling: el catálogo se actualiza solo cuando Supabase emite cambios reales.

    // Conexión pública a Supabase (segura con RLS activado)
    const SUPABASE_URL = 'https://rfjvskrimsoqlyofhidj.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_P1cgsqPGMWHHWIujJayyqg_9hgJEXZh';

    // Modo final: cuando Supabase tiene productos, la tienda usa SOLO Supabase.
    // Así, si eliminas u ocultas un producto desde el panel, desaparece de la tienda.
    // El catálogo local solo queda como respaldo si Supabase está vacío o falla.
    const DATA_SOURCE_MODE = 'supabase_first';

    const WA_PRIMARY   = '51930264550';
    const WA_SECONDARY = '51991564053';

    const SETTINGS = {
      currency: localStorage.getItem('innov_currency') || 'PEN',
      flyDurationMs: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fly-duration')) || 1050,
      trailDurationMs: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--trail-duration')) || 650,
      trailDensity: 26,
      trailSize: 10,
      useEmojiFirst: true,
      cartRedirectDelay: 350,
      toastTime: 1300
    };

    const state = {
      currency: SETTINGS.currency,
      mode: 'retail', // retail | wholesale
      page: 1,
      sort: 'relevance',
      cats: new Set(['ai','streaming','musica','otros']),
      min: 0,
      max: null,
      search: '',
      stockOnly: false
    };

    const DB_CATALOG = {
      loading: false,
      ready: false,
      error: null,
      retail: [],
      wholesale: [],
      updatedAt: null,
      signature: ''
    };
    const PUBLIC_CATALOG_CACHE_KEY = 'innov_public_catalog_cache_v1';
    const PUBLIC_CATALOG_CACHE_TTL_MS = 30 * 60 * 1000;

    let supabaseClient = null;
    try{
      if(window.supabase && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY){
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      }
    }catch(e){
      supabaseClient = null;
    }

    /* Realtime sin polling: recibe avisos Broadcast enviados por admin/checkout cuando hacen cambios. */
    const REALTIME_BUS_CHANNEL = 'innov-ia-data-events-v1';
    const REALTIME_CLIENT_ID = (()=>{ try{ let id=sessionStorage.getItem('innov_rt_client_id'); if(!id){ id='shop-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); sessionStorage.setItem('innov_rt_client_id',id); } return id; }catch(e){ return 'shop-'+Date.now().toString(36); }})();


    /* ================== Utils ================== */
    function esc(s){
      return String(s ?? '')
        .replaceAll('&','&amp;')
        .replaceAll('<','&lt;')
        .replaceAll('>','&gt;')
        .replaceAll('"','&quot;');
    }
    function normalizeUrl(u){
      if(!u) return '';
      u = String(u).trim();
      if(!u) return '';
      if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
      return u;
    }

    /* ================== Deep links por producto ================== */
    function buildProductLink(id){
      try{
        const url = new URL(window.location.href);
        url.hash = 'p=' + encodeURIComponent(id);
        return url.toString();
      }catch(e){
        const base = window.location.href.split('#')[0];
        return base + '#p=' + encodeURIComponent(id);
      }
    }
    function setProductHash(id){
      try{
        const url = new URL(window.location.href);
        url.hash = 'p=' + encodeURIComponent(id);
        history.replaceState(null, '', url.toString());
      }catch(e){
        window.location.hash = 'p=' + encodeURIComponent(id);
      }
    }
    function getProductFromHash(){
      const raw = String(window.location.hash || '').replace(/^#/, '');
      if(!raw) return null;
      const params = new URLSearchParams(raw);
      return params.get('p');
    }
    async function copyToClipboard(text){
      try{
        if(navigator.clipboard && window.isSecureContext){
          await navigator.clipboard.writeText(text);
          return true;
        }
      }catch(e){}
      try{
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly','');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        return true;
      }catch(e){
        return false;
      }
    }

    /* ================== Carrito (NO se pega) ================== */
    const CART_KEY = 'innov_cart_v1';
    const CART_STORE = sessionStorage; // IMPORTANT: no se queda guardado

    const readCart = () => { try { return JSON.parse(CART_STORE.getItem(CART_KEY) || '[]'); } catch(e){ return []; } };
    const writeCart = (arr) => CART_STORE.setItem(CART_KEY, JSON.stringify(arr));

    window.Cart = window.Cart || {
      add: (item) => {
        const items = readCart();
        const idx = items.findIndex(i => i.id === item.id);
        if(idx>-1){ items[idx].qty += (item.qty||1); }
        else { items.push({ id:item.id, nombre:item.nombre, precio:Number(item.precio||0), imagen:item.imagen||'', qty:item.qty||1, source:item.source||'local', product_id:item.product_id||null, plan_id:item.plan_id||null, plan_name:item.plan_name||null, stock_control:item.stock_control||'local', meta:item.meta||{} }); }
        writeCart(items);
        return items;
      },
      items: ()=> readCart(),
      count: ()=> readCart().reduce((a,b)=>a+b.qty,0),
      clear: ()=> { CART_STORE.removeItem(CART_KEY); }
    };

    function syncHeaderBadges(){
      const c = Cart.count();
      document.querySelectorAll('[data-innov-cart-count]').forEach(b=>{ b.textContent = c; });

      const badgeModalCart = document.getElementById('modalCartQty');
      if (badgeModalCart) {
        badgeModalCart.textContent = c;
      }
    }

    /* ================== Moneda ================== */
    function penToUsd(pen){ return pen / FX; }
    function formatMoneyPen(n){ return 'S/ ' + (Number(n)||0).toFixed(2); }
    function formatMoneyUsd(n){ return '$ ' + (Number(n)||0).toFixed(2); }
    function fmt(nPen){
      if(nPen==null) return 'Consultar';
      return state.currency==='USD' ? formatMoneyUsd(penToUsd(nPen)) : formatMoneyPen(nPen);
    }
    function toPen(valUi){
      if(valUi==null) return null;
      return state.currency==='USD' ? (Number(valUi) * FX) : Number(valUi);
    }
    function fromPen(valPen){
      return state.currency==='USD' ? (valPen/FX) : valPen;
    }

    /* ================== Imagen por link (logo por dominio) ================== */
    function domainFromUrl(u){
      try{
        const url = new URL(normalizeUrl(u));
        return url.hostname.replace(/^www\./,'');
      }catch(e){
        return '';
      }
    }
    function primaryThumbFromDomain(domain){
      return domain ? `https://logo.clearbit.com/${domain}?size=512` : 'assets/img/product-placeholder.svg';
    }
    function fallbackThumbFromDomain(domain){
      return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=256` : 'assets/img/product-placeholder.svg';
    }
    function resolveThumb(it){
      if(it.thumb) return it.thumb;
      const d = domainFromUrl(it.url);
      return primaryThumbFromDomain(d);
    }
    function resolveThumbFallback(it){
      const d = domainFromUrl(it.url);
      return fallbackThumbFromDomain(d);
    }


    /* ================== Video limpio por producto ================== */
    /* ================== Video por producto ==================
       Una sola fuente de verdad: campos video_* devueltos por Supabase.
       Las tarjetas reproducen silenciadas; el detalle permite activar audio. */
    function resolveVideoUrl(it){
      if(!it) return '';
      if(it.videoEnabled===false || it.video_enabled===false || it.product_video_enabled===false || it.plan_video_enabled===false) return '';
      return normalizeUrl(it.videoUrl || it.video_url || it.product_video_url || it.plan_video_url || it.video || '');
    }
    function videoYoutubeId(raw){
      const u=String(raw||'').trim(); if(!u) return '';
      try{const x=new URL(normalizeUrl(u));const h=x.hostname.replace(/^www\.|^m\./g,'');if(h==='youtu.be')return x.pathname.split('/').filter(Boolean)[0]||'';if(h.includes('youtube.com')){if(x.pathname.startsWith('/shorts/')||x.pathname.startsWith('/embed/'))return x.pathname.split('/').filter(Boolean)[1]||'';return x.searchParams.get('v')||'';}}catch(_){ }
      const m=u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);return m?m[1]:'';
    }
    function videoVimeoId(raw){const m=String(raw||'').match(/vimeo\.com\/(?:video\/)?(\d+)/i);return m?m[1]:'';}
    function videoTikTokId(raw){const m=String(raw||'').match(/(?:video\/|player\/v1\/|embed\/)(\d{8,})/i);return m?m[1]:'';}
    function videoDriveId(raw){const u=String(raw||'').trim();if(!u)return '';try{const x=new URL(normalizeUrl(u));if(/drive\.google\.com|drive\.usercontent\.google\.com/i.test(x.hostname)){const p=x.pathname.split('/').filter(Boolean),i=p.indexOf('d');return (i>=0&&p[i+1])?p[i+1]:(x.searchParams.get('id')||'');}}catch(_){ }const m=u.match(/drive\.google\.com\/file\/d\/([^\/?#]+)/i)||u.match(/[?&]id=([^&#]+)/i);return m?decodeURIComponent(m[1]):'';}
    function detectVideoSource(raw){
      const url=normalizeUrl(raw);if(!url)return {type:'none'};
      const yt=videoYoutubeId(url);if(yt)return {type:'youtube',id:yt};
      const vm=videoVimeoId(url);if(vm)return {type:'vimeo',id:vm};
      const gd=videoDriveId(url);if(gd)return {type:'gdrive',id:gd,url:`https://drive.google.com/uc?export=download&id=${encodeURIComponent(gd)}`};
      const tk=videoTikTokId(url);if(tk)return {type:'tiktok',id:tk};
      if(/\.(mp4|webm|ogg)(?:[?#]|$)/i.test(url))return {type:'file',url};
      return {type:'unsupported'};
    }
    function markVideoStatus(el,text,show=true){if(!el)return;el.textContent=text||'';el.classList.toggle('show',!!show&&!!text);}
    function revealSmartVideo(shell){if(!shell)return;shell.classList.add('media-ready');const wrap=shell.closest('.product-img,.modal-product-media');if(wrap)wrap.classList.add('video-ready');}
    function fallbackSmartVideo(shell,statusEl){if(!shell)return;shell.dataset.failed='1';shell.classList.remove('media-ready','media-loading');const wrap=shell.closest('.product-img,.modal-product-media');if(wrap)wrap.classList.remove('video-ready');markVideoStatus(statusEl,'',false);}
    function stopSmartVideoShell(shell){if(!shell)return;try{if(shell._videoEl)shell._videoEl.pause();}catch(_){ }shell._videoEl=null;shell._frame=null;shell.innerHTML='';shell.classList.remove('media-ready','media-loading','fit-contain','is-iframe-source');delete shell.dataset.started;}
    function videoFrame(shell,src,statusEl){
      const frame=document.createElement('iframe');frame.src=src;frame.loading='eager';frame.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('allowfullscreen','');frame.onload=()=>{shell.classList.remove('media-loading');revealSmartVideo(shell);};shell.classList.add('is-iframe-source');shell.appendChild(frame);shell._frame=frame;setTimeout(()=>{if(!shell.classList.contains('media-ready'))fallbackSmartVideo(shell,statusEl);},8000);return frame;
    }
    function startSmartVideoShell(shell,soundBtn,statusEl){
      if(!shell||shell.dataset.started==='1'||shell.dataset.failed==='1')return;
      const media=detectVideoSource(shell.dataset.videoUrl||'');if(media.type==='none'||media.type==='unsupported'){fallbackSmartVideo(shell,statusEl);return;}
      shell.dataset.started='1';shell.classList.add('media-loading');if((shell.dataset.videoFit||'cover')==='contain')shell.classList.add('fit-contain');
      if(location.protocol==='file:' && ['youtube','vimeo','tiktok'].includes(media.type)){
        /* Navegadores bloquean o degradan embeds externos bajo file://.
           Conservamos la imagen y evitamos mostrar errores del proveedor durante pruebas locales. */
        shell.dataset.localPreview='1';fallbackSmartVideo(shell,statusEl);return;
      }
      if(media.type==='file'||media.type==='gdrive'){
        const v=document.createElement('video');v.src=media.url;v.muted=true;v.defaultMuted=true;v.autoplay=true;v.loop=true;v.playsInline=true;v.preload='metadata';v.setAttribute('muted','');v.setAttribute('playsinline','');v.addEventListener('canplay',()=>{shell.classList.remove('media-loading');revealSmartVideo(shell);v.play().catch(()=>{});},{once:true});v.addEventListener('error',()=>fallbackSmartVideo(shell,statusEl),{once:true});shell.appendChild(v);shell._videoEl=v;v.play().catch(()=>{});return;
      }
      if(media.type==='youtube'){videoFrame(shell,`https://www.youtube-nocookie.com/embed/${encodeURIComponent(media.id)}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(media.id)}&controls=0&rel=0&playsinline=1&modestbranding=1&enablejsapi=1`,statusEl);return;}
      if(media.type==='vimeo'){videoFrame(shell,`https://player.vimeo.com/video/${encodeURIComponent(media.id)}?background=1&autoplay=1&muted=1&loop=1&controls=0&playsinline=1`,statusEl);return;}
      if(media.type==='tiktok'){videoFrame(shell,`https://www.tiktok.com/player/v1/${encodeURIComponent(media.id)}?autoplay=1&muted=1&loop=1&controls=0&play_button=0&volume_control=0&fullscreen_button=0`,statusEl);}
    }
    const productVideoObserver=('IntersectionObserver'in window)?new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){const shell=entry.target;productVideoObserver.unobserve(shell);startSmartVideoShell(shell,shell._soundBtn,shell._statusEl);}});},{rootMargin:'180px 0px',threshold:.18}):null;
    function initSmartVideoShell(shell,soundBtn,statusEl){
      if(!shell||shell.dataset.bound==='1')return;shell.dataset.bound='1';shell.dataset.muted='1';shell._soundBtn=soundBtn||null;shell._statusEl=statusEl||null;
      if(soundBtn){soundBtn.onclick=e=>{e.preventDefault();e.stopPropagation();const on=shell.dataset.muted!=='0';shell.dataset.muted=on?'0':'1';soundBtn.textContent=on?'🔊':'🔇';soundBtn.classList.toggle('is-sound-on',on);applySmartVideoSound(shell,on);};}
      if(productVideoObserver)productVideoObserver.observe(shell);else setTimeout(()=>startSmartVideoShell(shell,soundBtn,statusEl),80);
    }
    function applySmartVideoSound(shell,wantSound){
      if(!shell)return;if(shell._videoEl){shell._videoEl.muted=!wantSound;shell._videoEl.volume=wantSound?.8:0;shell._videoEl.play().catch(()=>{});return;}
      const f=shell._frame;if(!f||!f.contentWindow)return;const media=detectVideoSource(shell.dataset.videoUrl||'');try{if(media.type==='youtube'){f.contentWindow.postMessage(JSON.stringify({event:'command',func:wantSound?'unMute':'mute',args:[]}), '*');f.contentWindow.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}), '*');}else if(media.type==='vimeo'){f.contentWindow.postMessage(JSON.stringify({method:'setVolume',value:wantSound?1:0}),'*');f.contentWindow.postMessage(JSON.stringify({method:'play'}),'*');}else if(media.type==='tiktok'){f.contentWindow.postMessage({type:wantSound?'unMute':'mute','x-tiktok-player':true},'*');f.contentWindow.postMessage({type:'play','x-tiktok-player':true},'*');}}catch(_){ }
    }
    function initProductVideos(scope){const root=scope||document;root.querySelectorAll('.js-product-video').forEach(shell=>{const wrap=shell.closest('.product-img,.modal-product-media'),modal=!!(wrap&&wrap.classList.contains('modal-product-media'));initSmartVideoShell(shell,modal?wrap.querySelector('.js-video-sound'):null,modal?wrap.querySelector('.js-video-status'):null);});}
    function setupModalVideo(item){const shell=document.getElementById('modalVideo'),btn=document.getElementById('modalSoundBtn'),statusEl=document.getElementById('modalVideoStatus');if(!shell)return;stopSmartVideoShell(shell);shell.className='product-video-shell js-product-video';shell.dataset.muted='1';const url=resolveVideoUrl(item);if(!url){if(btn)btn.hidden=true;return;}shell.dataset.videoUrl=url;shell.dataset.videoFit=item?.videoFit||item?.video_fit||'cover';if(btn){btn.hidden=false;btn.textContent='🔇';btn.classList.remove('is-sound-on');}initSmartVideoShell(shell,btn,statusEl);setTimeout(()=>startSmartVideoShell(shell,btn,statusEl),80);}

    /* ================== Disponible / Cupo ================== */
    // Default: disponible (verde)
    // Rojo si: disponible === false o cupo <= 0
    function isDisponible(it){
      if(hasPlans(it)) return getPlans(it).some(p=>isPlanDisponible(p));
      const disp = (it.disponible !== false);
      if(!disp) return false;
      if(typeof it.cupo === 'number' && it.cupo <= 0) return false;
      return true;
    }
    function statusLabel(it){
      if(!isDisponible(it)){
        return hasPlans(it) ? 'Sin stock' : 'No disponible';
      }
      const stock = stockAmount(it);
      if(typeof stock === 'number'){
        return stock >= 999999 ? 'Disponible • stock ilimitado' : `Disponible • ${stock} cupos`;
      }
      if(hasPlans(it)){
        const availablePlans = getPlans(it).filter(p=>isPlanDisponible(p)).length;
        return `Disponible • ${availablePlans}/${getPlans(it).length} planes`;
      }
      return 'Disponible';
    }

    function stockAmount(it){
      if(!it) return null;
      if(hasPlans(it)){
        const nums = getPlans(it).map(p=>p.cupo).filter(v=>typeof v === 'number' && !isNaN(v));
        return nums.length ? nums.reduce((a,b)=>a+b,0) : null;
      }
      if(typeof it.cupo === 'number' && !isNaN(it.cupo)) return it.cupo;
      return null;
    }

    function hasLiveStock(it){
      if(!isDisponible(it)) return false;
      const stock = stockAmount(it);
      if(typeof stock === 'number') return stock > 0;
      return true;
    }

    function statusClass(it){
      return isDisponible(it) ? 'is-available' : 'is-unavailable';
    }
    function catLabel(cat){
      if(cat==='ai') return 'IA';
      if(cat==='streaming') return 'STREAM';
      if(cat==='musica') return 'VIDEO';
      if(cat==='otros') return 'TOOLS';
      return String(cat||'').toUpperCase();
    }
    function catIconClass(cat){
      if(cat==='ai') return 'fas fa-robot';
      if(cat==='streaming') return 'fas fa-tv';
      if(cat==='musica') return 'fas fa-wand-magic-sparkles';
      if(cat==='otros') return 'fas fa-toolbox';
      return 'fas fa-tag';
    }
    function miniBadgesHTML(it){
      const badges = [];
      const stock = stockAmount(it);
      const source = it.source === 'supabase' ? 'DB' : 'Local';
      badges.push(`<span class="product-mini-badge"><i class="${catIconClass(it.cat)}"></i>${esc(catLabel(it.cat))}</span>`);
      badges.push(`<span class="product-mini-badge"><i class="fas fa-bolt"></i>${esc(hasPlans(it) ? (getPlans(it).length + ' planes') : (it.period || 'Rápido'))}</span>`);
      if(typeof stock === 'number'){
        badges.push(`<span class="product-mini-badge"><i class="fas fa-box"></i>${esc(stock)} disponibles</span>`);
      }else{
        badges.push(`<span class="product-mini-badge"><i class="fab fa-whatsapp"></i>Soporte</span>`);
      }
      badges.push(`<span class="product-mini-badge"><i class="fas fa-database"></i>${esc(source)}</span>`);
      return `<div class="product-mini-badges">${badges.join('')}</div>`;
    }

    function waUrl(msg, which='primary'){
      const phone = which==='secondary' ? WA_SECONDARY : WA_PRIMARY;
      return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    }
    function consultWhatsApp(it){
      const name = it?.name ?? 'Producto';
      const price = it?.price ?? null;

      const modeTxt = state.mode==='wholesale' ? 'PROVEEDOR' : 'POR MENOR';
      const priceTxt = (price==null) ? 'Precio: consultar' : `Precio: ${formatMoneyPen(price)}`;
      const estadoTxt = isDisponible(it) ? 'Estado: DISPONIBLE' : 'Estado: NO DISPONIBLE';
      const cupoTxt = (typeof it?.cupo === 'number') ? `Cupo: ${it.cupo}` : 'Cupo: (no aplica)';

      const msg = `¡Hola! 👋\nQuiero información sobre: ${name}\nModo: ${modeTxt}\n${priceTxt}\n${estadoTxt}\n${cupoTxt}`;
      window.open(waUrl(msg,'primary'), '_blank', 'noopener');
    }


    function makeTextThumb(textLabel, bg='#111827', fg='#ffffff', sub=''){
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
          <defs>
            <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="${bg}"/>
              <stop offset="100%" stop-color="#0b0b0b"/>
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="72" fill="url(#g)"/>
          <circle cx="256" cy="182" r="112" fill="rgba(255,255,255,.08)"/>
          <text x="256" y="250" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="900" fill="${fg}">${textLabel}</text>
          <text x="256" y="332" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="rgba(255,255,255,.82)">${sub}</text>
        </svg>`;
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    /* ==========================================================
       CATÁLOGO (POR MENOR)
       ✅ Productos iguales agrupados: edita precios en plans[].price
       ========================================================== */
    const CATALOG = [
      {
            "id": "rt-event-bts-campob",
            "priority": 0,
            "name": "Entrada BTS (07) San MARCOS",
            "price": 1500,
            "cat": "otros",
            "url": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6oxFy8GdKjCEi1snsRRKkyncdY9dxJNQWFA&s",
            "thumb": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR6oxFy8GdKjCEi1snsRRKkyncdY9dxJNQWFA&s",
            "period": "Evento",
            "cupo": 1,
            "disponible": true,
            "chips": [
                  "BTS",
                  "Campo B",
                  "07 Oct.",
                  "Cupo único"
            ],
            "desc": "Entrada BTS con 1 solo lugar disponible. Ubicación: Campo B en Campo de Marte. Fecha del evento: 7 de octubre.",
            "benefits": [
                  "🎫 Entrada BTS lista para separar",
                  "📍 Ubicación: Campo B San Marcos",
                  "📅 Fecha: 7 de octubre",
                  "🔥 Solo 1 cupo disponible",
                  "🛟 Coordinación por WhatsApp"
            ],
            "why": "Ideal si buscas asegurar un lugar único para el evento de BTS antes de que se agote."
      },
      {
            "id": "rt-ai-chatgpt-plus",
            "priority": 1,
            "name": "ChatGPT Plus",
            "price": 10,
            "cat": "ai",
            "url": "https://openai.com/chatgpt",
            "period": "3 planes",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "3 planes",
                  "Desde S/10",
                  "Mensual"
            ],
            "desc": "ChatGPT Plus agrupado: elige el plan según uso, cantidad de usuarios y presupuesto.",
            "benefits": [
                  "✅ 3 planes en un solo producto",
                  "📌 Planes seleccionables desde la información",
                  "🛒 Cada plan se agrega al carrito por separado",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Más ordenado: una sola tarjeta y dentro eliges el plan exacto que deseas comprar.",
            "plans": [
                  {
                        "id": "rt-ai-gpt-8",
                        "name": "Compartido — Celular + PC",
                        "price": 10,
                        "period": "Mensual",
                        "cupo": null,
                        "disponible": true,
                        "chips": [
                              "Celular + PC",
                              "Más usuarios",
                              "Mensual"
                        ],
                        "desc": "Plan económico para usar ChatGPT Plus en celular o PC.",
                        "benefits": [
                              "✅ Acceso mensual",
                              "👥 Tiene más usuarios (mejor disponibilidad)",
                              "📱 Compatible en celular y PC",
                              "⚡ Entrega rápida"
                        ],
                        "why": "Ideal si quieres buen precio y usarlo en más de un dispositivo.",
                        "url": "https://openai.com/chatgpt"
                  },
                  {
                        "id": "rt-ai-gpt-12",
                        "name": "Solo celular — 3 usuarios",
                        "price": 10,
                        "period": "Mensual",
                        "cupo": null,
                        "disponible": true,
                        "chips": [
                              "Solo Celular",
                              "Pocos usuarios",
                              "No se satura",
                              "Mensual"
                        ],
                        "desc": "Plan solo para celular: pocos usuarios, estable y sin saturación.",
                        "benefits": [
                              "✅ Acceso mensual (solo celular)",
                              "🚫 No se satura (pocos usuarios)",
                              "📱 Ideal para tareas, estudio y trabajo",
                              "⚡ Entrega inmediata",
                              "🛟 Soporte por WhatsApp"
                        ],
                        "why": "Perfecto si lo usarás únicamente en el teléfono y quieres estabilidad.",
                        "url": "https://openai.com/chatgpt"
                  },
                  {
                        "id": "rt-ai-gpt-18",
                        "name": "Cuenta propia — Activación en tu correo",
                        "price": 30,
                        "period": "Mensual",
                        "cupo": null,
                        "disponible": true,
                        "chips": [
                              "Cuenta propia",
                              "Windows 10/11",
                              "iOS/macOS",
                              "Mensual"
                        ],
                        "desc": "Chatgpt plus para tu correo personal, es renovable",
                        "benefits": [
                              "✅ Acceso mensual (Activamos a tu correo)",
                              "💻 Cuenta original",
                              "🍎 Garantia mensual",
                              "🎁 Renovable mensualmente",
                              "🛟 Soporte por WhatsApp"
                        ],
                        "why": "Es cuenta entera para tu misma cuenta",
                        "url": "https://openai.com/chatgpt"
                  }
            ]
      },
      {
            "id": "rt-st-netflix",
            "priority": 1,
            "name": "Netflix",
            "price": 13,
            "cat": "streaming",
            "url": "https://www.netflix.com",
            "period": "Mensual",
            "cupo": 5,
            "disponible": true,
            "chips": [
                  "Mensual",
                  "Streaming",
                  "Soporte"
            ],
            "desc": "Entretenimiento premium con soporte.",
            "benefits": [
                  "🎬 Series y películas",
                  "⚡ Entrega rápida",
                  "🛟 Soporte por WhatsApp",
                  "Consulte por mas meses menos es el precio",
                  "🔒 Configuración guiada"
            ],
            "why": "La clásica: para maratonear sin complicaciones."
      },
      {
            "id": "rt-ai-perplexity",
            "priority": 2,
            "name": "Perplexity Pro",
            "price": 10,
            "cat": "ai",
            "url": "https://www.perplexity.ai",
            "period": "1 MES",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "1 mes",
                  "Búsqueda con fuentes",
                  "Compartido"
            ],
            "desc": "IA para investigar con fuentes: respuestas rápidas, útiles y verificables.",
            "benefits": [
                  "🚀 Acceso a IA avanzadas (según disponibilidad)",
                  "🔍 Búsquedas inteligentes con fuentes reales",
                  "⚡ Cuenta compartida",
                  "📦 Renovable mensualmente 🔐",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Ideal para estudiar, investigar y trabajar con información más confiable."
      },
      {
            "id": "rt-vid-capcut",
            "priority": 4,
            "name": "CapCut Pro",
            "price": 10,
            "cat": "musica",
            "url": "https://www.capcut.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "1 dispositivo",
                  "Mensual",
                  "Edición Pro"
            ],
            "desc": "Edición premium para videos (solo 1 dispositivo). Ideal para TikTok/Reels.",
            "benefits": [
                  "📱💻 Puedes usarlo en 3 dispositivos",
                  "✨ Efectos y plantillas Pro",
                  "🎬 Exportación sin marcas (según plan)",
                  "⚡ Activación rápida",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Para creadores: mejoras tus videos en minutos con herramientas Pro."
      },
      {
            "id": "rt-ai-super-grock",
            "priority": 4,
            "name": "SuperGrok",
            "price": 25,
            "cat": "ai",
            "url": "https://x.ai/grok",
            "thumbFit": "contain",
            "period": "1 mes",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Cuenta completa",
                  "1 mes",
                  "IA premium"
            ],
            "desc": "Acceso completo por 1 mes para quienes buscan una experiencia premium con Grok.",
            "benefits": [
                  "Cuenta completa",
                  "Ideal para consultas, ideas y apoyo diario",
                  "Entrega rápida",
                  "Soporte por WhatsApp"
            ],
            "why": "Buena opción si quieres una cuenta completa con duración mensual."
      },
      {
            "id": "rt-vid-kiling",
            "priority": 5,
            "name": "Kling AI",
            "price": 16,
            "cat": "musica",
            "url": "https://kling.ai",
            "thumbFit": "contain",
            "period": "1 mes",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "1 mes",
                  "Video IA",
                  "Premium"
            ],
            "desc": "Herramienta premium por 1 mes para creación visual y contenido con IA.",
            "benefits": [
                  "Generación de video e imagen con IA",
                  "Herramientas premium",
                  "Entrega rápida",
                  "Soporte por WhatsApp"
            ],
            "why": "Buena opción si quieres crear contenido visual con IA durante todo el mes."
      },
      {
            "id": "rt-vid-meitu",
            "priority": 6,
            "name": "Meitu",
            "price": 16,
            "cat": "musica",
            "url": "https://www.meitu.com",
            "thumbFit": "contain",
            "period": "1 mes",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "1 mes",
                  "Edición",
                  "Premium"
            ],
            "desc": "Edición premium por 1 mes para fotos, retoques y contenido visual.",
            "benefits": [
                  "Herramientas de edición y retoque",
                  "Funciones premium",
                  "Activación rápida",
                  "Soporte por WhatsApp"
            ],
            "why": "Ideal para mejorar imágenes y publicaciones con un plan mensual."
      },
      {
            "id": "rt-vid-picsart-12m",
            "priority": 7,
            "name": "Picsart PRO",
            "price": 34,
            "cat": "musica",
            "url": "https://picsart.com",
            "thumbFit": "contain",
            "period": "12 meses",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "12 meses",
                  "Diseño Pro",
                  "Edición"
            ],
            "desc": "Plan Picsart PRO por 12 meses para edición y diseño continuo.",
            "benefits": [
                  "Herramientas premium de edición",
                  "Útil para redes y contenido visual",
                  "Duración de 12 meses",
                  "Soporte por WhatsApp"
            ],
            "why": "Recomendado si quieres una opción anual para editar sin preocuparte por renovar cada mes."
      },
      {
            "id": "rt-ai-gemini-google-one",
            "priority": 8,
            "name": "Gemini Pro + Google One 5TB",
            "price": 15,
            "cat": "ai",
            "url": "https://one.google.com",
            "period": "1 mes",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "2 opciones",
                  "5 TB",
                  "Gemini Pro"
            ],
            "desc": "Opciones de Gemini Pro y Google One 5 TB agrupadas en una sola tarjeta.",
            "benefits": [
                  "✅ Gemini Pro",
                  "☁️ Google One 5 TB",
                  "📧 Activación en Gmail",
                  "⚡ Entrega rápida"
            ],
            "why": "Ideal para quienes quieren IA de Google más almacenamiento en un mismo servicio.",
            "plans": [
                  {
                        "id": "rt-ai-gemini",
                        "name": "Gemini PRO + 5 TB Google One",
                        "price": 15,
                        "period": "1 mes",
                        "cupo": 3,
                        "disponible": true,
                        "chips": [
                              "1 mes",
                              "5 TB",
                              "En tu Gmail",
                              "Gemini Pro"
                        ],
                        "desc": "Gemini mensual garantizado",
                        "benefits": [
                              "🚀 Gemini PRO + ☁ 5 TB Google One",
                              "📧 Activación en tu propio correo Gmail",
                              "🤖 Gemini Pro 3.1",
                              "🎬 Creación de videos con IA",
                              "🧠 Animaciones, notas inteligentes y automatización",
                              "✉ IA en Gmail, Docs y Meet",
                              "🌊 Flow"
                        ],
                        "why": "Cuenta garantia de 1 mes.",
                        "url": "https://gemini.google.com/app"
                  },
                  {
                        "id": "rt-ai-googleone",
                        "name": "Google One 5TB + Gemini Pro",
                        "price": 15,
                        "period": "1 mes",
                        "cupo": 15,
                        "disponible": true,
                        "chips": [
                              "1 mes",
                              "5 TB",
                              "En tu Gmail",
                              "Gemini Pro"
                        ],
                        "desc": "2 TB de almacenamiento en tu cuenta + beneficios de Gemini integrados.",
                        "benefits": [
                              "☁ 5 TB Google One (en tu propio Gmail)",
                              "🚀 Incluye Gemini PRO (según disponibilidad)",
                              "✉ IA en Gmail, Docs y Meet",
                              "⏳ Vreacion de musica",
                              "🧠 Herramientas inteligentes y automatización",
                              "⚡ Activación directa en tu cuenta"
                        ],
                        "why": "Para quienes necesitan almacenamiento + IA integrada en Google garantia 1 mes.",
                        "url": "https://one.google.com"
                  }
            ]
      },
      {
            "id": "rt-tools-public-check",
            "priority": 9,
            "name": "DOX CEO",
            "price": 5,
            "cat": "otros",
            "url": "https://innovaishop.com/shop.html",
            "thumb": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRgXdj-JxPTeKEbXY6fMhE44KYY4aVoWMULLw&s",
            "period": "Entrega rápida",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Legal",
                  "Fuentes públicas",
                  "S/5"
            ],
            "desc": "Busqueda de informacion por DNI, numero de cel ",
            "benefits": [
                  "🔎 C4, arbol genealogico, dudas, ETC",
                  "📄 Busqueda de deuda",
                  "⚡ Precio por cada uno",
                  "🛟 Atake con spam a N° de celulares"
            ],
            "why": "Por cada accion es el precio, todo confidencial bajo uso respondable del que adquiera el servicio"
      },
      {
            "id": "rt-tools-autodesk",
            "priority": 11,
            "name": "Autodesk Suite",
            "price": 15,
            "cat": "otros",
            "url": "https://www.autodesk.com",
            "period": "1 año",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "1 año",
                  "AutoCAD + Revit",
                  "Suite completa"
            ],
            "desc": "Autodesk por 1 año: incluye herramientas CAD, BIM, modelado, render y más.",
            "benefits": [
                  "📐 CAD / Dibujo: AutoCAD, AutoCAD LT, Mechanical, Electrical, Civil 3D…",
                  "🏗️ BIM: Revit + Navisworks + InfraWorks…",
                  "🧱 Modelado/Render: 3ds Max, Maya, Arnold…",
                  "⚙️ Manufactura: Inventor, Fusion…",
                  "🛟 Soporte por WhatsApp"
            ],
            "extraSections": [
                  {
                        "title": "CAD / Dibujo",
                        "items": [
                              "AutoCAD",
                              "AutoCAD LT",
                              "AutoCAD Mechanical",
                              "AutoCAD Electrical",
                              "AutoCAD Map 3D",
                              "AutoCAD Civil 3D",
                              "AutoCAD Architecture",
                              "AutoCAD MEP",
                              "AutoCAD Raster Design"
                        ]
                  },
                  {
                        "title": "BIM / Construcción",
                        "items": [
                              "Revit",
                              "Revit Architecture",
                              "Revit Structure",
                              "Revit MEP",
                              "Navisworks Manage",
                              "Navisworks Simulate",
                              "InfraWorks",
                              "Advance Steel",
                              "FormIt"
                        ]
                  },
                  {
                        "title": "Diseño Mecánico / Manufactura",
                        "items": [
                              "Inventor",
                              "Inventor CAM",
                              "Inventor Nastran",
                              "Fusion",
                              "Fusion Design",
                              "Fusion Manufacturing",
                              "Fusion Electronics"
                        ]
                  },
                  {
                        "title": "Media / Animación / Render",
                        "items": [
                              "3ds Max",
                              "Maya",
                              "Arnold",
                              "MotionBuilder",
                              "Mudbox"
                        ]
                  },
                  {
                        "title": "Infraestructura / GIS",
                        "items": [
                              "Vehicle Tracking",
                              "Storm and Sanitary Analysis",
                              "InfoDrainage"
                        ]
                  },
                  {
                        "title": "Construcción en la nube",
                        "items": [
                              "Autodesk Construction Cloud",
                              "BIM Collaborate",
                              "BIM Collaborate Pro",
                              "Docs",
                              "Build",
                              "Takeoff"
                        ]
                  },
                  {
                        "title": "Simulación y Análisis",
                        "items": [
                              "Robot Structural Analysis",
                              "CFD",
                              "Moldflow"
                        ]
                  },
                  {
                        "title": "Utilidades",
                        "items": [
                              "Recap",
                              "Recap Pro",
                              "Design Review"
                        ]
                  }
            ],
            "why": "Perfecto para estudiantes y profesionales que necesitan la suite completa."
      },
      {
            "id": "rt-tools-office365",
            "priority": 12,
            "name": "Office 365 — Consultar",
            "price": null,
            "cat": "otros",
            "url": "https://www.microsoft.com/microsoft-365",
            "period": "Consultar",
            "cupo": null,
            "disponible": false,
            "chips": [
                  "Word",
                  "Excel",
                  "PowerPoint",
                  "En tu cuenta"
            ],
            "desc": "Office 365 (Word, Excel, PowerPoint y más). Consultar disponibilidad.",
            "benefits": [
                  "📄 Word + 📊 Excel + 📽️ PowerPoint",
                  "☁️ OneDrive (según plan)",
                  "💼 Ideal para trabajo y universidad",
                  "⚡ Coordinación rápida por WhatsApp"
            ],
            "why": "Consulta y te pasamos el plan más conveniente."
      },
      {
            "id": "rt-tools-canva-pro",
            "priority": 13,
            "name": "Canva Pro",
            "price": 8,
            "cat": "otros",
            "url": "https://www.canva.com",
            "period": "2 planes",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "1 año / 3 años",
                  "Diseño Pro",
                  "Desde S/8"
            ],
            "desc": "Canva Pro agrupado: selecciona duración de 1 año o 3 años desde la información.",
            "benefits": [
                  "🎨 Plantillas premium",
                  "🧩 Recursos Pro",
                  "📌 Planes por duración",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Elige la duración que más te convenga sin duplicar productos en la tienda.",
            "plans": [
                  {
                        "id": "rt-tools-canva-1y",
                        "name": "Canva Pro — 1 año",
                        "price": 8,
                        "period": "1 año",
                        "cupo": null,
                        "disponible": true,
                        "chips": [
                              "1 año",
                              "Diseño Pro",
                              "Plantillas premium"
                        ],
                        "desc": "Diseño premium por 1 año. Perfecto para marcas, negocios y contenido.",
                        "benefits": [
                              "🎨 Plantillas premium + recursos Pro",
                              "🧩 Kit de marca (logos, colores, tipografías)",
                              "🪄 Quitar fondo y herramientas Pro",
                              "📲 Útil para redes sociales y trabajos",
                              "EDU"
                        ],
                        "why": "Diseña como profesional sin pagar precios altos.",
                        "url": "https://www.canva.com"
                  },
                  {
                        "id": "rt-tools-canva-2y",
                        "name": "Canva Pro — 3 años",
                        "price": 10,
                        "period": "3 años",
                        "cupo": 30,
                        "disponible": true,
                        "chips": [
                              "3 años",
                              "Ahorro",
                              "Diseño Pro"
                        ],
                        "desc": "Canva Pro por 2 años: más ahorro y tranquilidad.",
                        "benefits": [
                              "🎨 Todo Canva Pro",
                              "⏳ Duración: 3 años",
                              "💸 Más económico que renovar mes a mes",
                              "📈 Ideal para negocios y creadores",
                              "EDU"
                        ],
                        "why": "Mejor opción si usas Canva seguido (más ahorro).",
                        "url": "https://www.canva.com"
                  }
            ]
      },
      {
            "id": "rt-st-disney",
            "priority": 14,
            "name": "Disney Premium",
            "price": 8,
            "cat": "streaming",
            "url": "https://www.disneyplus.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Mensual",
                  "Familiar",
                  "Streaming"
            ],
            "desc": "Disney Premium para toda la familia.",
            "benefits": [
                  "🪄 Catálogo familiar",
                  "📺 Ideal para series y pelis",
                  "⚡ Entrega rápida",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Perfecto para casa, niños y maratones."
      },
      {
            "id": "rt-st-hbo",
            "priority": 15,
            "name": "HBO / Max",
            "price": 7,
            "cat": "streaming",
            "url": "https://www.max.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Mensual",
                  "Series top",
                  "Streaming"
            ],
            "desc": "Series y películas top del momento.",
            "benefits": [
                  "📺 Catálogo premium",
                  "⚡ Activación rápida",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Si te gustan las series fuertes, este es."
      },
      {
            "id": "rt-st-vix",
            "priority": 16,
            "name": "ViX",
            "price": 7,
            "cat": "streaming",
            "url": "https://vix.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Mensual",
                  "Contenido LATAM",
                  "Streaming"
            ],
            "desc": "Contenido en español y LATAM (según región).",
            "benefits": [
                  "🇵🇪 Contenido en español",
                  "⚡ Entrega rápida",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Ideal si buscas contenido latino."
      },
      {
            "id": "rt-st-prime",
            "priority": 17,
            "name": "Prime Video",
            "price": 8,
            "cat": "streaming",
            "url": "https://www.primevideo.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Mensual",
                  "Estrenos",
                  "Streaming"
            ],
            "desc": "Estrenos y clásicos: buena relación calidad/precio.",
            "benefits": [
                  "🎞️ Catálogo variado",
                  "⚡ Entrega rápida",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Gran alternativa para ver de todo."
      },
      {
            "id": "rt-st-iptv",
            "priority": 18,
            "name": "IPTV",
            "price": 8,
            "cat": "streaming",
            "url": "https://example.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Mensual",
                  "Canales",
                  "Soporte"
            ],
            "desc": "IPTV con opciones por región y compatibilidad.",
            "benefits": [
                  "📡 Canales y contenido (según plan)",
                  "🧩 Asesoría de compatibilidad",
                  "⚡ Entrega rápida",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Te ayudamos a elegir el plan ideal para tu equipo."
      },
      {
            "id": "rt-st-crunchy",
            "priority": 19,
            "name": "Crunchyroll",
            "price": 5,
            "cat": "streaming",
            "url": "https://www.crunchyroll.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Mensual",
                  "Anime",
                  "Streaming"
            ],
            "desc": "Anime sin anuncios (según plan).",
            "benefits": [
                  "🍥 Catálogo de anime",
                  "⚡ Entrega rápida",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Para fans del anime: simple y rápido."
      },
      {
            "id": "rt-vpn-surfshark-device",
            "priority": 20,
            "name": "Surfshark VPN (1 dispositivo)",
            "price": 7,
            "cat": "otros",
            "url": "https://surfshark.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "1 dispositivo",
                  "Mensual",
                  "VPN"
            ],
            "desc": "VPN para 1 dispositivo. Útil para privacidad y acceso (según región).",
            "benefits": [
                  "🔒 Privacidad y seguridad",
                  "📱 1 dispositivo",
                  "⚡ Activación rápida",
                  "🛟 Soporte por WhatsApp"
            ],
            "why": "Ideal si quieres VPN económica para un solo equipo."
      }
];

    /* ==========================================================
       CATÁLOGO (PROVEEDORES / CUENTAS COMPLETAS)
       ✅ Productos iguales agrupados: edita precios en plans[].price
       ========================================================== */
    const WHOLESALE = [
      {
            "id": "wh-ai-chatgpt-full",
            "priority": 1,
            "name": "ChatGPT Plus — Cuenta completa (Proveedor)",
            "price": 20,
            "cat": "ai",
            "url": "https://openai.com/chatgpt",
            "period": "Mensual",
            "cupo": 12,
            "disponible": true,
            "chips": [
                  "Cuenta completa",
                  "Agotado"
            ],
            "desc": "Cuenta completa para proveedor. Actualmente sin cupo.",
            "benefits": [
                  "🔑 Cuenta completa (control total)",
                  "🛟 Soporte para proveedor",
                  "⚠️ Ahora: sin cupo"
            ],
            "why": "Cuando vuelve stock, avisamos por WhatsApp."
      },
      {
            "id": "wh-st-disney-7u",
            "priority": 2,
            "name": "Disney Premium (7 usuarios)",
            "price": 25,
            "cat": "streaming",
            "url": "https://www.disneyplus.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "7 usuarios",
                  "Proveedor",
                  "Mensual"
            ],
            "desc": "Plan para proveedor: hasta 7 usuarios (multiusuario).",
            "benefits": [
                  "👥 Hasta 7 usuarios",
                  "🪄 Catálogo familiar",
                  "⚡ Entrega rápida",
                  "🛟 Soporte a proveedores"
            ],
            "why": "Perfecto para revender o gestionar varios clientes."
      },
      {
            "id": "wh-vid-capcut-3d",
            "priority": 3,
            "name": "CapCut Pro (3 dispositivos)",
            "price": 5,
            "cat": "musica",
            "url": "https://www.capcut.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "3 dispositivos",
                  "Proveedor",
                  "Mensual"
            ],
            "desc": "CapCut Pro para proveedor: hasta 3 dispositivos.",
            "benefits": [
                  "📱 Hasta 3 dispositivos",
                  "✨ Herramientas Pro",
                  "⚡ Activación rápida",
                  "🛟 Pedido minimo 3 cuentas"
            ],
            "why": "Ideal para vender a creadores o agencias de contenido."
      },
      {
            "id": "wh-tools-canva-500",
            "priority": 4,
            "name": "Canva (hasta 500 usuarios)",
            "price": 35,
            "cat": "otros",
            "url": "https://www.canva.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "500 usuarios",
                  "Proveedor",
                  "Mensual"
            ],
            "desc": "Plan para proveedor: gran capacidad de usuarios.",
            "benefits": [
                  "👥 Hasta 500 usuarios (según configuración)",
                  "🎨 Recursos Pro y plantillas",
                  "⚡ Entrega rápida",
                  "🛟 Soporte a proveedores"
            ],
            "why": "Para equipos grandes o reventa a escala."
      },
      {
            "id": "wh-tools-autodesk",
            "priority": 5,
            "name": "Autodesk — Proveedor",
            "price": 35,
            "cat": "otros",
            "url": "https://www.autodesk.com",
            "period": "2 planes",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Proveedor",
                  "250 / 3000 usuarios",
                  "Desde S/35"
            ],
            "desc": "Autodesk para proveedores agrupado: elige cantidad de usuarios y duración.",
            "benefits": [
                  "👥 Opciones para proveedor",
                  "📐 Suite Autodesk",
                  "⏳ 1 año o 3 años",
                  "🛟 Soporte a proveedores"
            ],
            "why": "Más fácil de vender: una sola tarjeta con los dos planes grandes de Autodesk.",
            "plans": [
                  {
                        "id": "wh-tools-autodesk-250-1y",
                        "name": "250 usuarios — 1 año",
                        "price": 35,
                        "period": "1 año",
                        "cupo": 2,
                        "disponible": true,
                        "chips": [
                              "250 usuarios",
                              "1 año",
                              "Cupo 2",
                              "Proveedor"
                        ],
                        "desc": "Autodesk para proveedor: 250 usuarios por 1 año (cupos limitados).",
                        "benefits": [
                              "👥 250 usuarios",
                              "⏳ 1 año",
                              "📐 CAD + BIM + Render",
                              "🛟 Soporte a proveedores"
                        ],
                        "why": "Muy buena opción para empresas/equipos grandes (cupos limitados).",
                        "url": "https://www.autodesk.com"
                  },
                  {
                        "id": "wh-tools-autodesk-3000-3y",
                        "name": "3000 usuarios — 3 años",
                        "price": 60,
                        "period": "3 años",
                        "cupo": null,
                        "disponible": true,
                        "chips": [
                              "3000 usuarios",
                              "3 años",
                              "Proveedor"
                        ],
                        "desc": "Plan masivo para proveedor: 3000 usuarios por 3 años.",
                        "benefits": [
                              "👥 3000 usuarios",
                              "⏳ 3 años",
                              "📐 Suite profesional",
                              "🛟 Soporte a proveedores"
                        ],
                        "why": "Para proyectos grandes o reventa a escala (muy rentable).",
                        "url": "https://www.autodesk.com"
                  }
            ]
      },
      {
            "id": "wh-st-youtube-5u",
            "priority": 7,
            "name": "YouTube (5 usuarios / no renovable)",
            "price": 7,
            "cat": "streaming",
            "url": "https://www.youtube.com/premium",
            "period": "Mensual",
            "cupo": null,
            "disponible": false,
            "chips": [
                  "5 usuarios",
                  "No renovable",
                  "Proveedor"
            ],
            "desc": "Cuenta para proveedor: 5 usuarios. No renovable (se gestiona por periodos).",
            "benefits": [
                  "👥 5 usuarios",
                  "🚫 No renovable",
                  "▶️ Sin anuncios y segundo plano (según plan)",
                  "🛟 Soporte a proveedores"
            ],
            "why": "Ideal para ofrecer packs a varios clientes."
      },
      {
            "id": "wh-st-crunchy-full",
            "priority": 8,
            "name": "Crunchyroll",
            "price": 15,
            "cat": "streaming",
            "url": "https://www.crunchyroll.com",
            "period": "Mensual",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Cuenta completa",
                  "Proveedor",
                  "Mensual"
            ],
            "desc": "Cuenta completa mensual para proveedor.",
            "benefits": [
                  "🍥 Anime",
                  "🔑 Cuenta completa",
                  "⚡ Entrega rápida",
                  "🛟 Soporte a proveedores"
            ],
            "why": "Producto premium para fans (mejor margen)."
      },
      {
            "id": "wh-vpn-surfshark-full-3m",
            "priority": 9,
            "name": "Surfshark VPN",
            "price": 32,
            "cat": "otros",
            "url": "https://surfshark.com",
            "period": "3 meses",
            "cupo": null,
            "disponible": true,
            "chips": [
                  "Cuenta completa",
                  "3 meses",
                  "Proveedor"
            ],
            "desc": "VPN cuenta completa por 3 meses.",
            "benefits": [
                  "🔒 Privacidad y seguridad",
                  "🔑 Cuenta completa",
                  "⏳ Duración: 3 meses",
                  "🛟 Soporte a proveedores"
            ],
            "why": "Plan perfecto para vender como pack trimestral."
      }
];


    function normalizeKey(s){
      return String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/^-+|-+$/g,'');
    }

    function parseJsonArray(value){
      if(Array.isArray(value)) return value;
      if(typeof value === 'string'){
        try{
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        }catch(e){ return []; }
      }
      return [];
    }

    function catalogRowsSignature(rows){
      try{
        return JSON.stringify((rows || []).map(r => ({
          product_id:r.product_id, product_slug:r.product_slug, product_name:r.product_name,
          product_active:r.product_active, product_priority:r.product_priority, sale_mode:r.sale_mode,
          plan_id:r.plan_id, plan_slug:r.plan_slug, plan_name:r.plan_name,
          price:r.price, currency:r.currency, period:r.period, stock_mode:r.stock_mode,
          available_stock:r.available_stock, availability_status:r.availability_status,
          allow_purchase_without_stock:r.allow_purchase_without_stock,
          image_url:r.image_url, plan_image_url:r.plan_image_url,
          product_video_url:r.product_video_url || r.video_url, plan_video_url:r.plan_video_url,
          product_video_type:r.product_video_type, plan_video_type:r.plan_video_type,
          product_video_fit:r.product_video_fit, plan_video_fit:r.plan_video_fit,
          product_video_enabled:r.product_video_enabled, plan_video_enabled:r.plan_video_enabled,
          chips:r.chips, benefits:r.benefits
        })).sort((a,b)=>String(a.product_id+'-'+a.plan_id).localeCompare(String(b.product_id+'-'+b.plan_id))));
      }catch(e){
        return String(Date.now());
      }
    }

    function productLooksSame(localItem, dbItem){
      const a = normalizeKey(localItem?.name);
      const b = normalizeKey(dbItem?.name);
      const id = normalizeKey(localItem?.id);
      const slug = normalizeKey(dbItem?.slug || dbItem?.id);
      if(!a || !b) return false;
      if(a === b) return true;
      if(a.includes(b) || b.includes(a)) return true;
      if(slug && (id.includes(slug) || slug.includes(id))) return true;

      // Coincidencias conocidas del catálogo antiguo
      const aliases = [
        ['chatgpt-plus', 'chatgpt-plus'],
        ['canva-pro', 'canva-pro'],
        ['gemini', 'gemini'],
        ['capcut-pro', 'capcut-pro'],
        ['perplexity-pro', 'perplexity-pro']
      ];
      return aliases.some(([x,y]) => (a.includes(x) || id.includes(x)) && (b.includes(y) || slug.includes(y)));
    }

    function buildDbCatalog(rows){
      const map = new Map();

      (rows || []).forEach(row=>{
        const modeRaw = row.sale_mode || row.product_mode || row.mode || row.product_sale_mode || 'retail';
        const saleMode = String(modeRaw || 'retail').toLowerCase().includes('whole') || String(modeRaw).toLowerCase().includes('prove')
          ? 'wholesale'
          : 'retail';

        const productKey = row.product_slug || row.product_id;
        if(!map.has(productKey)){
          map.set(productKey, {
            id: 'db-' + (row.product_slug || row.product_id),
            source: 'supabase',
            saleMode,
            slug: row.product_slug || '',
            dbProductId: row.product_id || null,
            priority: Number(row.product_priority ?? 100),
            name: row.product_name || 'Producto',
            price: null,
            cat: row.category || 'otros',
            url: row.website_url || '',
            thumb: row.image_url || '',
            thumbFit: row.thumb_fit || 'contain',
            videoUrl: row.product_video_url || row.video_url || '',
            videoType: row.product_video_type || row.video_type || 'auto',
            videoFit: row.product_video_fit || row.video_fit || 'cover',
            videoEnabled: row.product_video_enabled !== false,
            period: 'Planes',
            cupo: 0,
            disponible: false,
            chips: ['Base de datos', 'Stock real'],
            desc: row.product_description || 'Servicio digital con stock en tiempo real.',
            benefits: [],
            why: row.product_why || 'Producto conectado al inventario real del panel admin.',
            extraSections: parseJsonArray(row.product_extra_sections),
            plans: []
          });
        }

        const item = map.get(productKey);
        const stock = Number(row.available_stock || 0);
        const stockMode = row.stock_mode || 'controlled';
        const availabilityStatus = row.availability_status || 'available';
        const allowWithoutStock = !!row.allow_purchase_without_stock;
        const chips = parseJsonArray(row.chips);
        const benefits = parseJsonArray(row.benefits);
        const planExtra = parseJsonArray(row.plan_extra_sections);

        function dbPlanIsAvailable(){
          if(availabilityStatus === 'unavailable') return false;
          if(availabilityStatus === 'consult') return true;
          if(stockMode === 'unlimited') return true;
          if(stockMode === 'manual' || stockMode === 'preorder') return allowWithoutStock || stock > 0 || availabilityStatus === 'available';
          return stock > 0 || allowWithoutStock;
        }

        item.plans.push({
          id: 'db-plan-' + row.plan_id,
          source: 'supabase',
          dbProductId: row.product_id || null,
          dbPlanId: row.plan_id || null,
          slug: row.plan_slug || '',
          name: row.plan_name || 'Plan',
          price: (row.price == null ? null : Number(row.price)),
          currency: row.currency || 'PEN',
          period: row.period || 'Mensual',
          cupo: stockMode === 'unlimited' ? null : stock,
          availableStock: stock,
          stockMode,
          availabilityStatus,
          allowPurchaseWithoutStock: allowWithoutStock,
          disponible: dbPlanIsAvailable(),
          chips: chips.length ? chips : [stockMode === 'controlled' ? 'Stock real' : 'Stock manual'],
          desc: row.plan_description || row.product_description || '',
          benefits: benefits.length ? benefits : ['Stock conectado al panel admin', 'Entrega según disponibilidad', 'Soporte por WhatsApp'],
          why: row.plan_why || row.product_why || row.plan_description || 'Este plan toma disponibilidad real desde Supabase.',
          extraSections: planExtra.length ? planExtra : parseJsonArray(row.product_extra_sections),
          url: row.plan_website_url || row.website_url || '',
          thumb: row.plan_image_url || row.image_url || '',
          thumbFit: row.plan_thumb_fit || row.thumb_fit || 'contain',
          videoUrl: row.plan_video_url || row.product_video_url || row.video_url || '',
          videoType: row.plan_video_type || row.product_video_type || 'auto',
          videoFit: row.plan_video_fit || row.product_video_fit || 'cover',
          videoEnabled: row.plan_video_enabled !== false && row.product_video_enabled !== false
        });
      });

      const retail = [];
      const wholesale = [];

      map.forEach(item=>{
        item.plans.sort((a,b)=>{
          const pa = Number(a.priority ?? 100);
          const pb = Number(b.priority ?? 100);
          if(pa !== pb) return pa - pb;
          return String(a.name).localeCompare(String(b.name));
        });

        const prices = item.plans.map(p=>p.price).filter(v=>typeof v === 'number' && !isNaN(v));
        item.price = prices.length ? Math.min(...prices) : null;
        item.cupo = item.plans.reduce((sum,p)=> sum + (typeof p.cupo === 'number' ? p.cupo : 0), 0);
        item.disponible = item.plans.some(p=>p.disponible !== false && (typeof p.cupo !== 'number' || p.cupo > 0));
        item.period = item.plans.length > 1 ? `${item.plans.length} planes` : (item.plans[0]?.period || 'Mensual');

        const firstPlan = item.plans.find(p=>p.disponible) || item.plans[0];
        if(firstPlan){
          item.benefits = firstPlan.benefits || item.benefits;
          const stockChip = (typeof item.cupo === 'number' && item.cupo > 0) ? `${item.cupo} disponibles` : 'Disponible';
          item.chips = [...new Set([...(item.chips||[]), ...(firstPlan.chips||[]), stockChip])].slice(0,5);
        }

        if(item.saleMode === 'wholesale') wholesale.push(item);
        else retail.push(item);
      });

      return { retail, wholesale };
    }

    function readCachedCatalogRows(){
      try{
        const cached = JSON.parse(sessionStorage.getItem(PUBLIC_CATALOG_CACHE_KEY) || 'null');
        if(!cached || !Array.isArray(cached.rows) || !Number(cached.savedAt)) return null;
        if(Date.now() - cached.savedAt > PUBLIC_CATALOG_CACHE_TTL_MS){
          sessionStorage.removeItem(PUBLIC_CATALOG_CACHE_KEY);
          return null;
        }
        return cached.rows;
      }catch(_){
        return null;
      }
    }

    function writeCachedCatalogRows(rows){
      try{
        sessionStorage.setItem(PUBLIC_CATALOG_CACHE_KEY, JSON.stringify({
          savedAt:Date.now(),
          rows:Array.isArray(rows) ? rows : []
        }));
      }catch(_){ }
    }

    function hydrateCatalogFromCache(){
      const rows = readCachedCatalogRows();
      if(!rows) return false;
      const built = buildDbCatalog(rows);
      DB_CATALOG.retail = built.retail;
      DB_CATALOG.wholesale = built.wholesale;
      DB_CATALOG.signature = catalogRowsSignature(rows);
      DB_CATALOG.ready = true;
      DB_CATALOG.updatedAt = new Date();
      return true;
    }

    async function loadSupabaseCatalog(options = {}){
      const silent = !!options.silent;
      const wasReady = DB_CATALOG.ready;
      DB_CATALOG.loading = true;
      DB_CATALOG.error = null;
      if(!silent) updateCatalogStatus('Cargando Supabase...');

      if(!supabaseClient){
        DB_CATALOG.loading = false;
        DB_CATALOG.ready = false;
        DB_CATALOG.error = 'No se encontró cliente Supabase.';
        if(!silent) updateCatalogStatus();
        return false;
      }

      try{
        const { data, error } = await supabaseClient.rpc('get_public_catalog');
        if(error) throw error;

        const rows = data || [];
        writeCachedCatalogRows(rows);
        const nextSignature = catalogRowsSignature(rows);
        const changed = nextSignature !== DB_CATALOG.signature;

        // Si no cambió nada, no reconstruimos ni re-renderizamos: elimina el parpadeo visible.
        if(changed || !wasReady){
          const built = buildDbCatalog(rows);
          DB_CATALOG.retail = built.retail;
          DB_CATALOG.wholesale = built.wholesale;
          DB_CATALOG.signature = nextSignature;
        }

        DB_CATALOG.ready = true;
        DB_CATALOG.updatedAt = new Date();
        DB_CATALOG.loading = false;
        if(!silent) updateCatalogStatus();
        return changed || !wasReady;
      }catch(err){
        DB_CATALOG.error = err?.message || String(err);
        DB_CATALOG.ready = false;
        DB_CATALOG.loading = false;
        if(!silent) updateCatalogStatus();
        return false;
      }
    }

    function updateCatalogStatus(customText){
      const el = document.getElementById('catalogStatus');
      if(!el) return;

      const totalDb = DB_CATALOG.retail.length + DB_CATALOG.wholesale.length;
      el.classList.remove('is-live','is-warn','is-error');

      if(customText){
        el.classList.add('is-warn');
        el.innerHTML = `<span class="source-dot local"></span> ${esc(customText)}`;
        return;
      }

      if(DB_CATALOG.error){
        el.classList.add('is-error');
        el.innerHTML = `<span class="source-dot local"></span> Supabase sin conexión • respaldo local activo`;
        return;
      }

      if(DB_CATALOG.ready && totalDb > 0){
        el.classList.add('is-live');
        el.innerHTML = `<span class="source-dot"></span> Catálogo actualizado`;
        return;
      }

      el.classList.add('is-warn');
      el.innerHTML = `<span class="source-dot local"></span> Catálogo local activo`;
    }

    function mergedRetailCatalog(){
      const db = Array.isArray(DB_CATALOG.retail) ? DB_CATALOG.retail : [];
      // Preparado para eliminación real: si Supabase tiene productos, NO mezclamos el catálogo local.
      // Así, al ocultar/eliminar en admin, desaparece de tienda.
      if(DB_CATALOG.ready && db.length) return db;
      return CATALOG;
    }

    function mergedWholesaleCatalog(){
      const db = Array.isArray(DB_CATALOG.wholesale) ? DB_CATALOG.wholesale : [];
      if(DB_CATALOG.ready && db.length) return db;
      return WHOLESALE;
    }

    function mergeCatalogs(localList, dbList){
      const db = Array.isArray(dbList) ? dbList : [];
      const local = Array.isArray(localList) ? localList : [];
      const cleanLocal = local.filter(localItem => !db.some(dbItem => productLooksSame(localItem, dbItem)));
      return [...db, ...cleanLocal];
    }

    function currentCatalog(){
      return state.mode === 'retail' ? mergedRetailCatalog() : mergedWholesaleCatalog();
    }

    /* ================== Productos con planes ================== */
    function hasPlans(it){ return !!(it && Array.isArray(it.plans) && it.plans.length); }
    function getPlans(it){ return hasPlans(it) ? it.plans : []; }
    function numericPrices(it){
      const prices = hasPlans(it)
        ? getPlans(it).map(p=>p.price).filter(p=>typeof p === 'number')
        : [it?.price].filter(p=>typeof p === 'number');
      return prices;
    }
    function getDisplayPrice(it){
      const prices = numericPrices(it);
      if(!prices.length) return null;
      return Math.min(...prices);
    }
    function getMaxPrice(it){
      const prices = numericPrices(it);
      if(!prices.length) return null;
      return Math.max(...prices);
    }
    function priceLabelHTML(it){
      const min = getDisplayPrice(it);
      const max = getMaxPrice(it);
      if(min==null) return 'Consultar';
      if(hasPlans(it) && max!=null && max !== min){
        return `<span class="small text-muted mr-1">Desde</span>${fmt(min)}`;
      }
      return fmt(min);
    }
    function getDefaultPlan(it){
      if(!hasPlans(it)) return null;
      return getPlans(it).find(p=>isPlanDisponible(p)) || getPlans(it)[0] || null;
    }
    function isPlanDisponible(plan){
      const disp = (plan?.disponible !== false);
      if(!disp) return false;
      const status = plan?.availabilityStatus || plan?.availability_status || 'available';
      const mode = plan?.stockMode || plan?.stock_mode || 'local';
      const allow = !!(plan?.allowPurchaseWithoutStock || plan?.allow_purchase_without_stock);
      if(status === 'unavailable') return false;
      if(status === 'consult') return true;
      if(mode === 'unlimited') return true;
      if(mode === 'manual' || mode === 'preorder') return allow || status === 'available' || Number(plan?.availableStock || plan?.cupo || 0) > 0;
      if(typeof plan?.cupo === 'number' && plan.cupo <= 0 && !allow) return false;
      return true;
    }
    function mergePlanItem(parent, plan){
      if(!plan) return parent;
      return {
        ...parent,
        ...plan,
        parentId: parent.id,
        baseName: parent.name,
        planId: plan.id,
        planName: plan.name,
        id: parent.id + '__' + plan.id,
        name: parent.name + ' — ' + plan.name,
        url: plan.url || parent.url,
        thumb: plan.thumb || parent.thumb,
        thumbFit: plan.thumbFit || parent.thumbFit,
        videoUrl: plan.videoUrl || parent.videoUrl || plan.video_url || parent.video_url || '',
        videoType: plan.videoType || parent.videoType || 'auto',
        videoFit: plan.videoFit || parent.videoFit || 'cover',
        videoEnabled: plan.videoEnabled !== false && parent.videoEnabled !== false,
        extraSections: plan.extraSections || parent.extraSections
      };
    }
    function catalogContainsId(list, id){
      return list.some(it => it.id === id || getPlans(it).some(p => p.id === id || (it.id + '__' + p.id) === id));
    }
    function findParentAndPlanById(id){
      const all = [...mergedRetailCatalog(), ...mergedWholesaleCatalog()];
      for(const it of all){
        if(it.id === id) return { item: it, plan: getDefaultPlan(it) };
        if(hasPlans(it)){
          const plan = getPlans(it).find(p => p.id === id || (it.id + '__' + p.id) === id);
          if(plan) return { item: it, plan };
        }
      }
      return { item: null, plan: null };
    }

    /* ================== Render ================== */
    const grid = document.getElementById('productsGrid');
    const pag = document.getElementById('pagination');
    const sectionTitle = document.getElementById('sectionTitle');

    function byCats(items){ return items.filter(it => state.cats.has(it.cat)); }
    function byPrice(items){
      const minPen = toPen(state.min);
      const maxPen = toPen(state.max);
      return items.filter(it => {
        const prices = numericPrices(it);
        if(!prices.length) return true;
        return prices.some(price => {
          if(minPen!=null && price < minPen) return false;
          if(maxPen!=null && price > maxPen) return false;
          return true;
        });
      });
    }
    function priceForSort(v,dir){
      if(v==null) return dir==='desc' ? -Infinity : Infinity;
      return v;
    }
    function sortItems(items){
      const arr = [...items];
      const s = state.sort;

      if (s === 'relevance') {
        arr.sort((a, b) => {
          const pa = (typeof a.priority === 'number') ? a.priority : 9999;
          const pb = (typeof b.priority === 'number') ? b.priority : 9999;
          if (pa !== pb) return pa - pb;
          return a.name.localeCompare(b.name);
        });
      } else if (s === 'price-asc') {
        arr.sort((a,b)=> priceForSort(getDisplayPrice(a),'asc') - priceForSort(getDisplayPrice(b),'asc'));
      } else if (s === 'price-desc') {
        arr.sort((a,b)=> priceForSort(getDisplayPrice(b),'desc') - priceForSort(getDisplayPrice(a),'desc'));
      } else if (s === 'name-asc') {
        arr.sort((a,b)=>a.name.localeCompare(b.name));
      } else if (s === 'name-desc') {
        arr.sort((a,b)=>b.name.localeCompare(a.name));
      }

      return arr;
    }

    function getFilterMaxPen(){
      const prices = currentCatalog().flatMap(it=>numericPrices(it)).filter(p=>typeof p === 'number');
      const max = prices.length ? Math.max(...prices) : 30;
      const minCap = (state.mode==='retail') ? 30 : 60;
      return Math.max(minCap, Math.ceil(max));
    }

    const minI = document.getElementById('minPrice');
    const maxI = document.getElementById('maxPrice');
    const priceLabel = document.getElementById('priceLabel');

    function updatePriceLabel(){
      const maxPen = getFilterMaxPen();
      if(state.currency==='USD'){
        priceLabel.textContent = `Rango (USD 0.00–${fromPen(maxPen).toFixed(2)})`;
      }else{
        priceLabel.textContent = `Rango (S/ 0–${maxPen})`;
      }
    }
    function resetPriceInputs(){
      const maxPen = getFilterMaxPen();
      const maxUi = fromPen(maxPen);
      minI.value = state.currency==='USD' ? (0).toFixed(2) : '0';
      maxI.value = state.currency==='USD' ? maxUi.toFixed(2) : String(maxPen);
      state.min = 0;
      state.max = maxUi;
      updatePriceLabel();
    }


    function bySearch(items){
      const q = normalizeKey(state.search);
      if(!q) return items;
      return items.filter(it=>{
        const hay = [
          it.name, it.id, it.slug, it.cat, it.desc, it.period,
          ...(Array.isArray(it.chips) ? it.chips : []),
          ...(Array.isArray(it.benefits) ? it.benefits : []),
          ...getPlans(it).flatMap(p => [p.name, p.slug, p.desc, p.period, ...(p.chips||[]), ...(p.benefits||[])])
        ].map(x=>normalizeKey(x)).join(' ');
        return hay.includes(q);
      });
    }

    function byStock(items){
      if(!state.stockOnly) return items;
      return items.filter(hasLiveStock);
    }

    function render(){
      sectionTitle.innerHTML = (state.mode==='retail')
        ? 'Productos <small class="text-muted">por menor</small>'
        : 'Proveedores <small class="text-muted">cuentas completas</small>';

      const BASE = currentCatalog();
      const filtered = bySearch(byStock(byPrice(byCats(BASE))));
      const sorted = sortItems(filtered);

      const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
      if(state.page > totalPages) state.page = totalPages;

      const start = (state.page-1)*PAGE_SIZE;
      const pageItems = sorted.slice(start, start+PAGE_SIZE);

      grid.querySelectorAll('.js-product-video').forEach(stopSmartVideoShell);
      grid.innerHTML = pageItems.length ? pageItems.map(cardHTML).join('') : `
        <div class="empty-state">
          <h5>No encontramos productos con esos filtros</h5>
          <p class="text-muted mb-2">Prueba limpiar precio, categoría, búsqueda o el filtro de stock.</p>
          <button class="btn btn-primary" type="button" onclick="document.getElementById('clearFilters').click()">Limpiar filtros</button>
        </div>
      `;
      bindCards();

      renderPagination(totalPages);
    }

    function cardHTML(it){
      const displayPrice = getDisplayPrice(it);
      const penAttr = (displayPrice==null) ? 'null' : String(displayPrice);
      const disponible = isDisponible(it);
      const thumb = resolveThumb(it);
      const fallback = resolveThumbFallback(it);
      const videoUrl = resolveVideoUrl(it);
      const hasVideo = !!videoUrl;
      const periodText = hasPlans(it) ? `${getPlans(it).length} planes` : (it.period || '');
      const period = periodText ? `<div class="period-note">${esc(periodText)}</div>` : '';
      const addTitle = hasPlans(it) ? 'Agregar plan recomendado' : 'Agregar al carrito';
      const buyTitle = hasPlans(it) ? 'Elegir plan y comprar' : (it.price==null ? 'Consultar por WhatsApp' : 'Comprar ahora');

      return `
        <div class="shop-product-cell">
          <div class="product-item mb-4 ${!disponible?'is-unavailable':''}"
               data-id="${esc(it.id)}"
               data-name="${esc(it.name)}"
               data-price="${displayPrice==null?'':esc(displayPrice)}"
               data-cat="${esc(it.cat)}"
               data-cupo="${(typeof it.cupo==='number') ? esc(it.cupo) : ''}"
               data-disponible="${(it.disponible===false) ? '0' : '1'}"
               data-url="${esc(normalizeUrl(it.url))}"
               data-period="${esc(periodText||'')}"
               data-chips="${esc(JSON.stringify(it.chips||[]))}"
               data-video-url="${esc(videoUrl)}">

            <div class="product-img product-media overflow-hidden ${hasVideo?'has-video':''}">
              <span class="status-pill ${statusClass(it)}">${esc(statusLabel(it))}</span>
              <span class="status-corner-icon" title="${esc(catLabel(it.cat))}"><i class="${catIconClass(it.cat)}"></i></span>

              <img class="img-fluid w-100 product-logo-img"
                   style="object-fit:${esc(it.thumbFit||'contain')};object-position:center;"
                   src="${esc(thumb)}"
                   data-fallback="${esc(fallback)}"
                   data-placeholder="assets/img/product-placeholder.svg"
                   loading="lazy"
                   decoding="async"
                   referrerpolicy="strict-origin-when-cross-origin"
                   alt="${esc(it.name)}">

              ${hasVideo ? `<div class="product-video-shell js-product-video" data-video-url="${esc(videoUrl)}" data-video-fit="${esc(it.videoFit||'cover')}" data-card-video="1"></div><div class="product-video-shade"></div>` : ''}

              <div class="product-action">
                <button class="btn btn-outline-dark btn-square btn-add" title="${addTitle}" ${(!disponible)?'disabled':''} aria-label="${addTitle}">
                  <i class="fas fa-cart-shopping" aria-hidden="true"></i>
                </button>

                <button class="btn btn-outline-dark btn-square btn-detail" title="Ver información" aria-label="Ver información">
                  <i class="fas fa-circle-info" aria-hidden="true"></i><span>Info</span>
                </button>

                <button class="btn btn-outline-dark btn-square btn-buy" title="${buyTitle}" ${(!disponible)?'disabled':''} aria-label="${buyTitle}">
                  <i class="fas fa-bolt" aria-hidden="true"></i>
                </button>
              </div>
            </div>

            <div class="text-center py-4">
              <a class="h6 text-decoration-none text-truncate js-title" href="#p=${encodeURIComponent(it.id)}">${esc(it.name)}</a>
              <div class="d-flex align-items-center justify-content-center mt-2">
                <h5 data-price-pen="${penAttr}">${priceLabelHTML(it)}</h5>
              </div>
              ${period}
${miniBadgesHTML(it)}
            </div>
          </div>
        </div>
      `;
    }

    function renderPagination(totalPages){
      let html = '';
      html += `<li class="page-item ${state.page===1?'disabled':''}">
        <a class="page-link js-page" data-page="${state.page-1}" href="#">Anterior</a>
      </li>`;
      for(let p=1;p<=totalPages;p++){
        html += `<li class="page-item ${state.page===p?'active':''}">
          <a class="page-link js-page" data-page="${p}" href="#">${p}</a>
        </li>`;
      }
      html += `<li class="page-item ${state.page===totalPages?'disabled':''}">
        <a class="page-link js-page" data-page="${state.page+1}" href="#">Siguiente</a>
      </li>`;

      pag.innerHTML = html;
      pag.querySelectorAll('.js-page').forEach(a=>{
        a.addEventListener('click', e=>{
          e.preventDefault();
          const p = Number(a.getAttribute('data-page'));
          if(!isNaN(p) && p>=1 && p<=totalPages){
            state.page = p;
            render();
            window.scrollTo({top:0, behavior:'smooth'});
          }
        });
      });
    }


    function cartPayloadFromItem(it, imagen){
      return {
        id: it.id,
        nombre: it.name,
        precio: Number(it.price || 0),
        imagen: imagen || '',
        qty: 1,
        source: it.source || 'local',
        product_id: it.dbProductId || it.parentId || it.id,
        plan_id: it.dbPlanId || it.planId || null,
        plan_name: it.planName || null,
        stock_control: it.source === 'supabase' ? 'supabase' : 'local',
        meta: {
          cat: it.cat || '',
          period: it.period || '',
          cupo: (typeof it.cupo === 'number' ? it.cupo : null)
        }
      };
    }
    function sellItemLabel(sellItem){
      const name = String(sellItem?.name || '').trim();
      const plan = String(sellItem?.planName || sellItem?.plan_name || '').trim();
      if(!plan || normalizeKey(name).includes(normalizeKey(plan))) return name;
      return [name, plan].filter(Boolean).join(' · ');
    }
    function performCartAdd(sellItem, imageUrl, options = {}){
      if(!sellItem) return false;
      Cart.add(cartPayloadFromItem(sellItem, imageUrl || ''));
      syncHeaderBadges();
      flyToCart({
        originEl: options.originEl || null,
        emoji: '',
        imgUrl: imageUrl || '',
        onEnd: attentionCartBadge
      });
      showToast('Añadido: ' + sellItemLabel(sellItem));
      if(options.redirectCheckout){
        setTimeout(()=>{ window.location.href='checkout.html'; }, SETTINGS.cartRedirectDelay);
      }
      return true;
    }

    /* ================== Acciones tarjetas ================== */
    function bindCards(){
      document.querySelectorAll('.product-item').forEach(card=>{
        const id = card.getAttribute('data-id');
        const nombre = card.getAttribute('data-name');
        const itCard = findItemById(id);

        const priceStr = card.getAttribute('data-price');
        const precio = (priceStr==='' ? null : Number(priceStr));

        const imgEl  = card.querySelector('.product-img img');
        const addBtn = card.querySelector('.btn-add');
        const detBtn = card.querySelector('.btn-detail');
        const buyBtn = card.querySelector('.btn-buy');
        const titleA = card.querySelector('.js-title');

        initProductVideos(card);

        // fallback imagen
        if(imgEl){
          imgEl.dataset.errstep = '0';
          imgEl.addEventListener('error', ()=>{
            const step = Number(imgEl.dataset.errstep || '0') + 1;
            imgEl.dataset.errstep = String(step);
            if(step===1 && imgEl.dataset.fallback) imgEl.src = imgEl.dataset.fallback;
            else if(step>=2) imgEl.src = imgEl.dataset.placeholder || 'assets/img/product-placeholder.svg';
          });
        }

        function addOrConsult(action='add'){
          const it = findItemById(id);
          if(!it) return;

          if(!isDisponible(it)){
            showToast('No disponible: ' + nombre);
            return;
          }

          if(hasPlans(it)){
            const availablePlans = getPlans(it).filter(isPlanDisponible);
            if(action === 'buy'){
              if(availablePlans.length === 1){
                const sellItem = mergePlanItem(it, availablePlans[0]);
                if(sellItem.price==null){ consultWhatsApp(sellItem); return; }
                const imageWithPlan = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
                performCartAdd(sellItem, imageWithPlan, { originEl: imgEl || buyBtn, redirectCheckout:true });
                return;
              }
              openDetail(id);
              showToast('Elige el plan y continúa ✅');
              return;
            }

            const defaultPlan = getDefaultPlan(it);
            if(!defaultPlan || !isPlanDisponible(defaultPlan)){
              openDetail(id);
              showToast('Elige un plan disponible ✅');
              return;
            }
            const sellItem = mergePlanItem(it, defaultPlan);
            if(sellItem.price==null){ consultWhatsApp(sellItem); return; }
            const imageWithPlan = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
            performCartAdd(sellItem, imageWithPlan, { originEl: imgEl || addBtn });
            return;
          }

          if(precio==null){
            consultWhatsApp(it);
            return;
          }

          const imagenFinal = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
          performCartAdd(it, imagenFinal, { originEl: imgEl || (action==='buy' ? buyBtn : addBtn), redirectCheckout:action==='buy' });
        }

        if(addBtn){ addBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); addOrConsult('add'); }, {passive:false}); }
        if(buyBtn){ buyBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); addOrConsult('buy'); }, {passive:false}); }
        if(detBtn){ detBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); openDetail(id); }, {passive:false}); }
        if(titleA){ titleA.addEventListener('click', e=>{ e.preventDefault(); openDetail(id); }); }
      });
    }

    function findItemById(id){
      return findParentAndPlanById(id).item;
    }

    function cleanBenefitText(value){
      return String(value || '')
        .replace(/^[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9]+/, '')
        .trim();
    }


    /* ================== Modal detalle ================== */
    const modalRoot = document.getElementById('productModal');
    let modalBackdrop = null;
    function hideProductModal(){
      if(!modalRoot) return;
      stopSmartVideoShell(document.getElementById('modalVideo'));
      modalRoot.classList.remove('show');
      modalRoot.style.display='none';
      modalRoot.setAttribute('aria-hidden','true');
      document.body.classList.remove('modal-open');
      if(modalBackdrop){modalBackdrop.remove();modalBackdrop=null;}
    }
    function showProductModal(){
      if(!modalRoot) return;
      if(!modalBackdrop){
        modalBackdrop=document.createElement('div');
        modalBackdrop.className='modal-backdrop fade show';
        modalBackdrop.addEventListener('click',hideProductModal);
        document.body.appendChild(modalBackdrop);
      }
      modalRoot.style.display='block';
      modalRoot.classList.add('show');
      modalRoot.setAttribute('aria-hidden','false');
      document.body.classList.add('modal-open');
      requestAnimationFrame(()=>modalRoot.querySelector('.modal-dialog')?.focus?.());
    }
    window.INNOV_SHOP_MODAL={open:showProductModal,close:hideProductModal};
    modalRoot?.querySelectorAll('[data-dismiss="modal"]').forEach(btn=>btn.addEventListener('click',hideProductModal));
    modalRoot?.addEventListener('click',e=>{if(e.target===modalRoot)hideProductModal();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalRoot?.classList.contains('show'))hideProductModal();});
    const elTitle  = document.getElementById('modalTitle');
    const elImg    = document.getElementById('modalImg');
    const elPrice  = document.getElementById('modalPrice');
    const elUsd    = document.getElementById('modalUsd');
    const elStatus = document.getElementById('modalStatus');
    const elChips  = document.getElementById('modalChips');
    const elDesc   = document.getElementById('modalDesc');
    const elPlansWrap = document.getElementById('modalPlansWrap');
    const elPlans  = document.getElementById('modalPlans');
    const elBen    = document.getElementById('modalBenefits');
    const elWhy    = document.getElementById('modalWhy');
    const elExtra  = document.getElementById('modalExtra');
    const btnAdd   = document.getElementById('modalAdd');
    const btnBuy   = document.getElementById('modalBuy');
    const btnCopy  = document.getElementById('modalCopyLink');
    const btnModalCart = document.getElementById('modalCartBtn');

    let modalItem = null;
    let modalPlan = null;

    function getModalSellItem(){
      if(!modalItem) return null;
      return hasPlans(modalItem) ? mergePlanItem(modalItem, modalPlan || getDefaultPlan(modalItem)) : modalItem;
    }

    if(btnCopy){
      btnCopy.addEventListener('click', async ()=>{
        if(!modalItem) return;
        const link = buildProductLink(modalItem.id);
        const ok = await copyToClipboard(link);
        showToast(ok ? 'Link copiado ✅' : 'No se pudo copiar');
        if(!ok){
          try{ window.prompt('Copia el link del producto:', link); }catch(e){}
        }
      });
    }

    if(btnModalCart){
      btnModalCart.addEventListener('click', ()=>{
        window.location.href = 'cart.html';
      });
    }

    function renderPlanSelector(parent){
      if(!hasPlans(parent)){
        elPlansWrap && elPlansWrap.classList.add('d-none');
        if(elPlans) elPlans.innerHTML = '';
        return;
      }

      elPlansWrap && elPlansWrap.classList.remove('d-none');
      const plans = getPlans(parent);
      elPlans.innerHTML = plans.map(plan=>{
        const active = modalPlan && modalPlan.id === plan.id;
        const disp = isPlanDisponible(plan);
        const chips = (plan.chips || []).slice(0,3).map(c=>`<span class="plan-chip">${esc(c)}</span>`).join('');
        const stateChip = disp ? `<span class="plan-chip plan-stock-ok">${typeof plan.cupo==='number' ? plan.cupo + ' disponibles' : 'Disponible'}</span>` : '<span class="plan-chip plan-stock-bad">Sin stock</span>';
        return `
          <button type="button" class="plan-option ${active?'active':''} ${!disp?'is-unavailable':''}" data-plan-id="${esc(plan.id)}" ${!disp?'disabled':''}>
            <div class="plan-top">
              <span class="plan-name">${esc(plan.name)}</span>
              <span class="plan-price">${plan.price==null?'Consultar':fmt(plan.price)}</span>
            </div>
            <div class="plan-meta">${chips}${stateChip}</div>
          </button>
        `;
      }).join('');

      elPlans.querySelectorAll('.plan-option').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const pid = btn.getAttribute('data-plan-id');
          const plan = getPlans(parent).find(p=>p.id === pid);
          if(!plan) return;
          modalPlan = plan;
          renderModalContent();
        });
      });
    }

    function renderModalContent(){
      if(!modalItem) return;
      const selected = getModalSellItem();
      const parent = modalItem;

      document.getElementById('productModalLabel').textContent = parent.name;
      elTitle.textContent = parent.name;

      elImg.src = resolveThumb(selected);
      elImg.style.objectFit = selected.thumbFit || parent.thumbFit || 'contain';
      elImg.style.objectPosition = 'center';
      elImg.onerror = () => { elImg.src = resolveThumbFallback(selected); };
      setupModalVideo(selected);

      elPrice.textContent = fmt(selected.price);

      if(selected.price==null){
        elUsd.textContent = 'Precio a consultar';
      }else{
        elUsd.textContent = state.currency==='USD'
          ? `≈ ${formatMoneyPen(selected.price)} en S/`
          : `≈ ${formatMoneyUsd(penToUsd(selected.price))} en USD`;
      }

      // Estado (verde/rojo)
      const disp = isDisponible(selected);
      elStatus.textContent = disp ? statusLabel(selected) : 'No disponible';
      elStatus.style.color = disp ? '#198754' : '#ff3b30';

      // Planes seleccionables
      renderPlanSelector(parent);

      // Chips
      elChips.innerHTML = '';
      const chips = Array.isArray(selected.chips) ? selected.chips : [];
      const cupoChip = (typeof selected.cupo === 'number') ? (selected.cupo >= 999999 ? 'Stock ilimitado' : `Cupos: ${selected.cupo}`) : null;
      const periodChip = selected.period ? `⏳ ${selected.period}` : null;
      const planChip = selected.planName ? `📌 ${selected.planName}` : null;

      [...chips, planChip, cupoChip, periodChip].filter(Boolean).forEach(txt=>{
        const div = document.createElement('div');
        div.className = 'meta-chip';
        div.innerHTML = `<i class="fa fa-star"></i> ${esc(txt)}`;
        elChips.appendChild(div);
      });

      elDesc.textContent = selected.desc || parent.desc || 'Servicio digital con entrega inmediata por WhatsApp.';

      // Beneficios (bonitos)
      elBen.innerHTML = '';
      (selected.benefits || parent.benefits || []).forEach(b=>{
        const li = document.createElement('li');
        li.innerHTML = `<i class="fa fa-check-circle"></i><div>${esc(cleanBenefitText(b))}</div>`;
        elBen.appendChild(li);
      });

      // Why (texto)
      elWhy.textContent = selected.why || parent.why || 'Precio competitivo, soporte y entrega rápida.';

      // Extra (Autodesk y otros con secciones)
      if(Array.isArray(selected.extraSections) && selected.extraSections.length){
        elExtra.classList.remove('d-none');
        elExtra.innerHTML = `<div class="font-weight-bold mb-2">📦 Suite / Más información</div>` +
          selected.extraSections.map(sec=>{
            const itemsHtml = (sec.items||[]).map(x=>`<div>${esc(x)}</div>`).join('');
            return `
              <details>
                <summary>${esc(sec.title)}</summary>
                <div class="mini-grid">${itemsHtml}</div>
              </details>
            `;
          }).join('');
      }else{
        elExtra.classList.add('d-none');
        elExtra.innerHTML = '';
      }

      // Botones
      btnAdd.disabled = (!disp) || (selected.price==null);
      btnBuy.disabled = (!disp) ? true : false;

      if(selected.price==null){
        btnBuy.innerHTML = '<i class="fab fa-whatsapp"></i> Consultar por WhatsApp';
      }else{
        btnBuy.innerHTML = '<i class="fas fa-bolt"></i> Comprar ahora';
      }

      syncHeaderBadges(); // actualiza contador de carrito dentro del modal
    }

    function openDetail(id){
      const match = findParentAndPlanById(id);
      const it = match.item;
      if(!it) return;
      modalItem = it;
      modalPlan = hasPlans(it) ? (match.plan || getDefaultPlan(it)) : null;

      /* ✅ Actualiza link directo: shop.html#p=ID */
      setProductHash(it.id);
      renderModalContent();
      showProductModal();
    }

    btnAdd.addEventListener('click', ()=>{
      const sellItem = getModalSellItem();
      if(!sellItem) return;
      if(!isDisponible(sellItem)) return showToast('No disponible: ' + sellItem.name);
      if(sellItem.price==null) return consultWhatsApp(sellItem);
      performCartAdd(sellItem, elImg.src, { originEl: elImg });
    });

    btnBuy.addEventListener('click', ()=>{
      const sellItem = getModalSellItem();
      if(!sellItem) return;
      if(!isDisponible(sellItem)) return showToast('No disponible: ' + sellItem.name);

      if(sellItem.price==null){
        consultWhatsApp(sellItem);
        return;
      }

      performCartAdd(sellItem, elImg.src, { originEl: elImg, redirectCheckout: true });
    });

    /* ================== Fly-to-cart ================== */
    function pageOffsetRect(el){
      const r = el.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
    }
    function findCartBadge(){
      return document.querySelector('.innov-safe-cart [data-innov-cart-count]') || document.querySelector('.innov-safe-cart');
    }
    function attentionCartBadge(){
      const b = findCartBadge();
      if(!b) return;
      b.classList.remove('cart-attn');
      void b.offsetWidth;
      b.classList.add('cart-attn');
      setTimeout(()=> b.classList.remove('cart-attn'), 750);
    }

    function bezier(t, p0, p1, p2){
      const u=1-t;
      return { x:u*u*p0.x + 2*u*t*p1.x + t*t*p2.x, y:u*u*p0.y + 2*u*t*p1.y + t*t*p2.y };
    }
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    function spawnTrail(x,y,idx){
      const dot = document.createElement('div');
      dot.className = 'trail';
      const cs = getComputedStyle(document.documentElement);
      dot.style.color = [cs.getPropertyValue('--trail-c1'), cs.getPropertyValue('--trail-c2'), cs.getPropertyValue('--trail-c3')][idx%3].trim();
      dot.style.left = (x - SETTINGS.trailSize/2) + 'px';
      dot.style.top  = (y - SETTINGS.trailSize/2) + 'px';
      dot.style.width = dot.style.height = (SETTINGS.trailSize + Math.random()*4) + 'px';
      document.body.appendChild(dot);
      setTimeout(()=> dot.remove(), SETTINGS.trailDurationMs);
    }

    function makeGhost(fromEl, emoji, imgUrl){
      const g = document.createElement('div'); g.className = 'fly-ghost';
      const from = pageOffsetRect(fromEl);
      g.style.left = (from.x + from.w/2 - 21) + 'px';
      g.style.top  = (from.y + from.h/2 - 21) + 'px';
      if(emoji){ g.textContent = emoji; }
      else if(imgUrl){
        g.classList.add('is-img');
        const im=document.createElement('img'); im.src=imgUrl;
        g.appendChild(im);
      }else{ g.textContent = '🛒'; }
      document.body.appendChild(g);
      return g;
    }

    function flyToCart({ originEl, emoji, imgUrl, onEnd }){
      const cartBadge = findCartBadge();
      if(!cartBadge || window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        onEnd && onEnd(); return;
      }
      const ghost = makeGhost(originEl, emoji, imgUrl);
      const start = pageOffsetRect(originEl);
      const end = pageOffsetRect(cartBadge);

      const p0 = { x: start.x + start.w/2, y: start.y + start.h/2 };
      const p2 = { x: end.x + end.w/2,   y: end.y + end.h/2 };
      const p1 = { x: (p0.x + p2.x)/2,   y: Math.min(p0.y, p2.y) - 120 };

      const t0 = performance.now();
      let lastTrail=-1e9, idx=0;

      function frame(now){
        const dt = now - t0;
        const t = Math.min(1, dt / SETTINGS.flyDurationMs);
        const et = easeOutCubic(t);
        const pos = bezier(et, p0, p1, p2);

        ghost.style.transform = `translate(${pos.x - p0.x}px, ${pos.y - p0.y}px) scale(${1 - et*0.3}) rotate(${et*20}deg)`;

        if(dt - lastTrail > SETTINGS.flyDurationMs / SETTINGS.trailDensity){
          spawnTrail(pos.x,pos.y,idx++);
          lastTrail = dt;
        }

        if(t < 1) requestAnimationFrame(frame);
        else { ghost.remove(); onEnd && onEnd(); }
      }
      requestAnimationFrame(frame);
    }

    /* ================== Toast ================== */
    const toast = document.getElementById('toastMini');
    const toastText = document.getElementById('toastText');
    let toastTimer = null;
    function showToast(msg='Añadido al carrito'){
      if(!toast) return;
      toastText.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(()=> toast.classList.remove('show'), SETTINGS.toastTime);
    }

    /* ================== Filtros ================== */

    const shopSearchInput = document.getElementById('shopSearchInput');
    if(shopSearchInput){
      shopSearchInput.addEventListener('input', ()=>{
        state.search = shopSearchInput.value.trim();
        state.page = 1;
        render();
      });
      shopSearchInput.addEventListener('submit', e=> e.preventDefault());
      const form = shopSearchInput.closest('form');
      if(form){
        form.addEventListener('submit', e=>{
          e.preventDefault();
          state.search = shopSearchInput.value.trim();
          state.page = 1;
          render();
        });
      }
    }

    const stockOnly = document.getElementById('stockOnly');
    if(stockOnly){
      stockOnly.addEventListener('change', ()=>{
        state.stockOnly = stockOnly.checked;
        state.page = 1;
        render();
      });
    }

    document.getElementById('applyFilters').addEventListener('click', ()=>{
      const min = minI.value.trim()==='' ? null : Number(minI.value);
      const max = maxI.value.trim()==='' ? null : Number(maxI.value);
      state.min = isNaN(min) ? null : min;
      state.max = isNaN(max) ? null : max;
      state.page = 1;
      render();
    });

    document.getElementById('clearFilters').addEventListener('click', ()=>{
      resetPriceInputs();
      state.page = 1;
      render();
    });

    document.querySelectorAll('.js-cat').forEach(chk=>{
      chk.addEventListener('change', ()=>{
        if(chk.checked) state.cats.add(chk.value);
        else state.cats.delete(chk.value);
        state.page = 1;
        render();
      });
    });

    document.getElementById('sortSelect').addEventListener('change', e=>{
      state.sort = e.target.value;
      state.page = 1;
      render();
    });

    /* ================== Tipo de venta ================== */
    const modeRetailBtn = document.getElementById('modeRetailBtn');
    const modeWholesaleBtn = document.getElementById('modeWholesaleBtn');

    modeRetailBtn.addEventListener('click', ()=>{
      state.mode = 'retail';
      state.page = 1;
      resetPriceInputs();
      render();
      modeRetailBtn.classList.add('active');
      modeWholesaleBtn.classList.remove('active');
    });

    modeWholesaleBtn.addEventListener('click', ()=>{
      state.mode = 'wholesale';
      state.page = 1;
      resetPriceInputs();
      render();
      modeWholesaleBtn.classList.add('active');
      modeRetailBtn.classList.remove('active');
    });

    /* ================== Moneda ================== */
    const currencyBtn = document.getElementById('currencyBtn');
    document.querySelectorAll('.js-set-currency').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        setCurrency(btn.getAttribute('data-currency'));
      });
    });

    function setCurrency(cur){
      state.currency = cur;
      localStorage.setItem('innov_currency', cur);
      if(currencyBtn) if(currencyBtn) currencyBtn.textContent = (cur==='USD' ? 'USD' : 'Soles');
      resetPriceInputs();
      render();
      if(modalItem) renderModalContent();
    }

    /* ================== Menú categorías ================== */
    document.querySelectorAll('.js-nav-cat').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        const cat = a.getAttribute('data-cat');
        state.cats = new Set([cat]);
        document.querySelectorAll('.js-cat').forEach(chk=>{
          chk.checked = (chk.value === cat);
        });
        state.page = 1;
        render();
      });
    });

    /* ================== Limpieza carrito al volver de pago ================== */
    (function maybeClearCartFromQuery(){
      const qs = new URLSearchParams(location.search);
      if(qs.get('paid') === '1'){
        Cart.clear();
        syncHeaderBadges();
        showToast('Compra finalizada. Carrito limpiado.');
        qs.delete('paid');
        const tail = qs.toString();
        history.replaceState({}, '', location.pathname + (tail ? '?' + tail : ''));
      }
    })();

    /* ================== Back to top ================== */
    (function(){
      const back = document.querySelector('.back-to-top');
      if(!back) return;
      back.addEventListener('click', e=>{
        e.preventDefault();
        window.scrollTo({ top:0, behavior:'smooth' });
      });
    })();

    /* ================== WhatsApp badges ================== */
    (function(){
      const button = document.getElementById('whatsappFab');
      const badge = document.getElementById('whatsappBadge');
      try{ if(sessionStorage.getItem('waBadgeHidden')==='1' && badge) badge.hidden=true; }catch(_){}
      if(button && badge){
        button.addEventListener('click', ()=>{
          badge.hidden=true;
          try{ sessionStorage.setItem('waBadgeHidden','1'); }catch(_){}
        });
      }
    })();

    /* ================== Filtros móviles sin dependencias ================== */
    function setFiltersOpen(open){
      const panel=document.getElementById('filtersCollapse');
      const btn=document.getElementById('filtersToggleBtn');
      if(!panel||!btn)return;
      panel.classList.toggle('show',!!open);
      btn.setAttribute('aria-expanded',open?'true':'false');
      btn.innerHTML=open?'<i class="fa fa-times mr-2"></i> Cerrar filtros':'<i class="fa fa-filter mr-2"></i> Filtros';
    }
    (function(){
      const btn=document.getElementById('filtersToggleBtn');
      const panel=document.getElementById('filtersCollapse');
      if(!btn||!panel)return;
      btn.removeAttribute('data-toggle');btn.removeAttribute('data-target');
      btn.addEventListener('click',()=>setFiltersOpen(!panel.classList.contains('show')));
      window.addEventListener('resize',()=>{if(window.innerWidth>=992)setFiltersOpen(false);},{passive:true});
    })();


    /* ================== Realtime de catálogo sin polling ================== */
    let catalogRealtimeChannel = null;
    let catalogRealtimeTimer = null;
    let catalogRealtimePending = false;

    function scheduleCatalogRealtimeRefresh(reason = 'change'){
      if(!supabaseClient) return;
      if(document.hidden){ catalogRealtimePending = true; return; }
      clearTimeout(catalogRealtimeTimer);
      catalogRealtimeTimer = setTimeout(async ()=>{
        if(document.hidden){ catalogRealtimePending = true; return; }
        const changed = await loadSupabaseCatalog({silent:true});
        if(changed){
          resetPriceInputs();
          render();
        }
      }, 650);
    }

    function initPublicCatalogRealtime(){
      if(catalogRealtimeChannel || !supabaseClient || !supabaseClient.channel) return;
      let ch = supabaseClient.channel(REALTIME_BUS_CHANNEL);
      ch = ch.on('broadcast', { event:'data_changed' }, msg => {
        const table = String(msg?.payload?.table || '');
        if(!table || /products|product_plans|stock_items|rpc|supabase|change/.test(table)) scheduleCatalogRealtimeRefresh('broadcast');
      });
      ['products','product_plans','stock_items'].forEach(table=>{
        ch = ch.on('postgres_changes', { event:'*', schema:'public', table }, () => {
          scheduleCatalogRealtimeRefresh(table);
        });
      });
      ch.subscribe(status=>{
        if(status === 'SUBSCRIBED') updateCatalogStatus();
      });
      catalogRealtimeChannel = ch;

      document.addEventListener('visibilitychange', ()=>{
        if(!document.hidden && catalogRealtimePending){
          catalogRealtimePending = false;
          scheduleCatalogRealtimeRefresh('resume');
        }
      });
      window.addEventListener('focus', ()=>{
        if(catalogRealtimePending){
          catalogRealtimePending = false;
          scheduleCatalogRealtimeRefresh('focus');
        }
      });
    }

    /* ================== INIT ================== */
    document.getElementById('sortSelect').value = state.sort;
    syncHeaderBadges();

    function syncModeButtons(){
      if(state.mode === 'wholesale'){
        modeWholesaleBtn.classList.add('active');
        modeRetailBtn.classList.remove('active');
      }else{
        modeRetailBtn.classList.add('active');
        modeWholesaleBtn.classList.remove('active');
      }
    }

    function openFromHashIfPossible(){
      const pid = getProductFromHash();
      if(!pid) return;
      const it = findItemById(pid);
      if(!it) return;

      const isWh = catalogContainsId(mergedWholesaleCatalog(), pid);
      if(isWh && state.mode !== 'wholesale'){
        state.mode = 'wholesale';
        syncModeButtons();
        resetPriceInputs();
        render();
      }
      if(!isWh && state.mode !== 'retail'){
        state.mode = 'retail';
        syncModeButtons();
        resetPriceInputs();
        render();
      }

      setFiltersOpen(false);
      openDetail(pid);
    }

    window.addEventListener('storage', function(e){
      if(e.key==='innov_currency'){
        setCurrency(localStorage.getItem('innov_currency')||'PEN');
      }
    });

    // La caché de sesión evita un catálogo vacío al volver; RPC/Realtime lo refrescan enseguida.
    const restoredCatalog = hydrateCatalogFromCache();
    setCurrency(state.currency);
    syncModeButtons();
    updateCatalogStatus('');
    loadSupabaseCatalog({silent:restoredCatalog}).finally(()=>{
      resetPriceInputs();
      render();
      openFromHashIfPossible();
    });

    // Realtime: cambios de productos/planes/cupos llegan por Supabase, sin consultar cada X segundos.
    initPublicCatalogRealtime();

  })();
