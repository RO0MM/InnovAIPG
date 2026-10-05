/* module: inline */
const SUPABASE_URL = "https://rfjvskrimsoqlyofhidj.supabase.co";
    const SUPABASE_KEY = "sb_publishable_P1cgsqPGMWHHWIujJayyqg_9hgJEXZh";
    const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    /* Realtime propio del checkout: no modifica window.fetch ni intercepta otras librerías. */
    const REALTIME_BUS_CHANNEL = 'innov-ia-data-events-v1';
    const REALTIME_CLIENT_ID = (() => {
      try {
        let id = sessionStorage.getItem('innov_checkout_realtime_id');
        if (!id) {
          id = 'checkout-a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
          sessionStorage.setItem('innov_checkout_realtime_id', id);
        }
        return id;
      } catch (_) {
        return 'checkout-a-' + Date.now().toString(36);
      }
    })();
    let checkoutDataEventChannel = null;
    let checkoutDataEventReady = false;
    let checkoutBroadcastQueue = [];

    function flushCheckoutBroadcastQueue(){
      if(!checkoutDataEventChannel || !checkoutDataEventReady || !checkoutBroadcastQueue.length) return;
      checkoutBroadcastQueue.splice(0, 8).forEach(payload => {
        try { checkoutDataEventChannel.send({type:'broadcast', event:'data_changed', payload}); } catch (_) {}
      });
    }
    function broadcastCheckoutDataChanged(table='checkout', method='WRITE'){
      checkoutBroadcastQueue.push({source:REALTIME_CLIENT_ID, origin:'checkout-a', table, method, at:Date.now()});
      setTimeout(flushCheckoutBroadcastQueue, 80);
    }

    const CART_KEY = 'innov_cart_v1';
    const CURRENT_ORDER_KEY = 'innov_current_checkout_order_v5';
    const APPLIED_COUPON_KEY = 'innov_applied_coupon_v1';
    // Sin polling: el estado del pedido se actualiza por eventos de Supabase Realtime.
    const $ = id => document.getElementById(id);

    let cart = [];
    let currentOrder = null;
    let currentCoupon = '';
    let couponPreview = null;
    let orderRealtimeChannel = null;
    let orderRealtimeTimer = null;
    let orderRealtimePending = false;
    let orderStatusPollTimer = null;
    let settings = { yape_number:'991564053', yape_qr_url:'' };
    let deliverySummary = { type:'manual', label:'Entrega manual', help:'Se requiere revisión/entrega por administrador.' };
    let planRequirementMap = new Map();
    let specialRequirements = [];
    let specialNotices = [];
    let chatMinimized = false;
    let activationBoxOpen = false;

    function safeParse(v, fallback){ try { return JSON.parse(v || ''); } catch(e){ return fallback; } }
    function readCart(){
      let c = safeParse(sessionStorage.getItem(CART_KEY), []);
      if(!c.length) c = safeParse(localStorage.getItem(CART_KEY), []);
      return c || [];
    }
    function clearCart(){ sessionStorage.removeItem(CART_KEY); localStorage.removeItem(CART_KEY); }
    function money(n){ return 'S/ ' + Number(n || 0).toFixed(2); }
    function esc(s){ return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
    function toast(msg){ const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2600); }
    async function notifyTelegram(event, extra={}){
      try{
        const orderCode = extra.order_code || currentOrder?.order_code || $('lookupOrderCode')?.value || '';
        if(!orderCode) return;
        const response = await fetch(`${SUPABASE_URL}/functions/v1/smooth-worker`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'apikey':SUPABASE_KEY },
          body: JSON.stringify({ event, order_code:orderCode, ...extra })
        });
        if(!response.ok) console.warn('Telegram alerta rechazada:', response.status, await response.text());
      }catch(e){ console.warn('Telegram alerta no enviada:', e); }
    }
    function setStep(n){ document.querySelectorAll('[data-step]').forEach(x => x.classList.toggle('active', Number(x.dataset.step) === Number(n))); }
    function subtotal(){ return cart.reduce((a,b)=>a + Number(b.precio || 0) * Number(b.qty || 1), 0); }
    function cartSignature(){ return JSON.stringify(cartDbItems().map(x=>({p:x.plan_id,q:x.qty})).sort((a,b)=>String(a.p).localeCompare(String(b.p)))); }
    function cartDbItems(){ return cart.map(i => ({ plan_id: i.plan_id || i.planId || i.supabase_plan_id || null, qty: Number(i.qty || 1) })).filter(i => i.plan_id); }
    function cloneItems(items){ return (items || []).map(item => ({ ...item })); }
    function countItems(items){ return (items || []).reduce((sum, item) => sum + Number(item?.qty || 0), 0); }
    function subtotalFromItems(items){ return (items || []).reduce((sum, item) => sum + Number(item?.precio || 0) * Number(item?.qty || 1), 0); }
    function getSummaryItems(orderRef){
      const liveItems = readCart();
      if(liveItems.length) return cloneItems(liveItems);
      const snapshot = orderRef?._cartSnapshot || currentOrder?._cartSnapshot || [];
      return cloneItems(snapshot);
    }
    function syncCheckoutAvailability(summaryItems){
      const hasActiveOrder = !!currentOrder?.order_code;
      const hasItems = Array.isArray(summaryItems) && summaryItems.length > 0;
      const isCheckoutEmpty = !hasItems && !hasActiveOrder;
      $('checkoutEmptyState')?.classList.toggle('hidden', !isCheckoutEmpty);
      $('formView')?.classList.toggle('checkout-form-disabled', isCheckoutEmpty);
      ['fullName','phone','country','terms','btnGenerateOrder'].forEach(id => {
        const el = $(id);
        if(el) el.disabled = isCheckoutEmpty;
      });
      const couponDisabled = isCheckoutEmpty || hasActiveOrder;
      if($('couponInput')) $('couponInput').disabled = couponDisabled;
      if($('btnApplyCoupon')) $('btnApplyCoupon').disabled = couponDisabled;
    }

    function uniqueBy(arr, keyFn){
      const seen = new Set();
      return arr.filter(x => {
        const k = keyFn(x);
        if(seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    function inferCheckoutRules(product={}, plan={}){
      const rawName = `${product.name||''} ${product.slug||''} ${plan.name||''} ${plan.slug||''}`;
      const name = rawName
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const price = Number(plan.price || 0);
      const make = (requirements, title, notice, instructions='') => ({requirements, title, notice, instructions});
      const gmailField = (label, placeholder='tucorreo@gmail.com', help='Usa un correo Gmail válido terminado en @gmail.com.') => ({
        key:'activation_email',
        label,
        type:'email',
        required:true,
        domain:'gmail.com',
        placeholder,
        help
      });

      const isSharedChatGPT = /(compartid|shared|alto trafico|alta demanda|pantalla|perfil|pc solo|celular|grupo|cupos)/.test(name);
      const isPersonalChatGPT = name.includes('chatgpt') && !isSharedChatGPT && (
        name.includes('cuenta personal') ||
        name.includes('personal') ||
        name.includes('cuenta propia') ||
        name.includes('correo propio') ||
        name.includes('propio') ||
        name.includes('activacion directa') ||
        name.includes('directa a tu correo') ||
        price >= 25
      );

      // ChatGPT: SOLO para planes de cuenta personal / correo propio.
      if(isPersonalChatGPT){
        return make([
          {key:'chatgpt_account_email', label:'Correo Gmail de tu cuenta ChatGPT', type:'email', required:true, domain:'gmail.com', placeholder:'tucorreo@gmail.com', help:'Coloca el Gmail donde deseas activar ChatGPT Plus.'},
          {key:'chatgpt_session_text', label:'Texto completo de sesión de ChatGPT', type:'textarea', required:true, min_length:80, placeholder:'Pega aquí todo el texto que aparece al abrir https://chatgpt.com/api/auth/session', help:'Inicia sesión en ChatGPT desde un navegador, abre el enlace y copia todo el texto.'}
        ], 'Activación ChatGPT Plus cuenta personal',
        'Tiempo máximo de activación: 12 horas. Puede validarse antes.',
        `✨ PASOS PARA ACTIVAR TU CHATGPT PLUS

1️⃣ Ingresa a tu cuenta de ChatGPT e inicia sesión normalmente con tu cuenta.

2️⃣ Accede al siguiente enlace:
🔗 https://chatgpt.com/api/auth/session

3️⃣ Copia todo el texto que aparece. Recuerda iniciar con tu cuenta de ChatGPT en un navegador.

4️⃣ Pega ese texto en el recuadro que aparece en esta página.

5️⃣ Espera mi confirmación y luego refresca tu ChatGPT ✅

🚫 Nota: en el paso 2, cierra todos los espacios de trabajo ChatGPT Business, si los hay, antes de recuperar la sesión.

🚀 ¡Listo! Tu plan Plus quedará activado.`);
      }

      if(name.includes('gemini') || name.includes('google one')){
        return make([gmailField('Correo Gmail para invitación / activación')], 'Datos para activar Gemini / Google One', 'Tiempo máximo de activación: 1 hora. Puede validarse antes.', '💎 Ingresa tu correo Gmail. La invitación o activación se enviará a ese correo. La confirmación llegará a tu WhatsApp.');
      }
      if(name.includes('youtube')){
        return make([gmailField('Correo Gmail para YouTube')], 'Datos para activar YouTube', 'La confirmación llegará a tu WhatsApp.', '▶️ Ingresa el Gmail donde deseas la activación de YouTube.');
      }
      if(name.includes('autodesk') || name.includes('autocad')){
        return make([
          gmailField('Correo Gmail para activar Autodesk'),
          {key:'autodesk_programs', label:'Programas Autodesk que deseas activar', type:'textarea', required:true, placeholder:'Ejemplo: AutoCAD, Revit, Civil 3D, Inventor', help:'Escribe los programas que necesitas activar.'}
        ], 'Datos para activar Autodesk Suite', 'Tiempo máximo de activación: 1 hora. Puede validarse antes.', '🧩 Ingresa tu Gmail y los programas Autodesk que deseas activar.');
      }
      if(name.includes('canva') || name.includes('canvas')){
        return make([gmailField('Correo Gmail para activar Canva / Canvas')], 'Datos para activar Canva / Canvas', 'Tiempo máximo de activación: 1 hora. Puede validarse antes.', '📩 Ingresa el Gmail donde deseas recibir la invitación o activación.');
      }
      if(name.includes('spotify')){
        return make([gmailField('Correo Gmail de Spotify / activación')], 'Datos para Spotify', 'La confirmación llegará a tu WhatsApp.', '🎵 Ingresa el Gmail donde deseas la activación de Spotify.');
      }
      return null;
    }
    async function loadSpecialRequirements(){
      cart = readCart();
      const ids = [...new Set(cartDbItems().map(x => x.plan_id).filter(Boolean))];
      planRequirementMap = new Map();
      specialRequirements = [];
      specialNotices = [];
      if(!ids.length){ renderSpecialRequirements(); return; }

      const [plansRes, configsRes] = await Promise.all([
        db.from('product_plans').select('id,name,slug,metadata,product_id').in('id', ids),
        db.from('checkout_plan_requirements').select('plan_id,title,notice,instructions,fields,active').in('plan_id', ids).eq('active', true)
      ]);
      if(plansRes.error || !plansRes.data){ renderSpecialRequirements(); return; }

      const configMap = new Map((configsRes.error ? [] : (configsRes.data || [])).map(row => [row.plan_id, row]));
      const productIds = [...new Set(plansRes.data.map(p => p.product_id).filter(Boolean))];
      let productsMap = new Map();
      if(productIds.length){
        const productsRes = await db.from('products').select('id,name,slug,metadata').in('id', productIds);
        if(!productsRes.error && productsRes.data) productsMap = new Map(productsRes.data.map(p => [p.id, p]));
      }

      plansRes.data.forEach(plan => {
        const product = productsMap.get(plan.product_id) || {};
        const productMeta = product?.metadata || {};
        const planMeta = plan?.metadata || {};
        const config = configMap.get(plan.id) || null;
        const productFields = Array.isArray(productMeta.requirements) ? productMeta.requirements : [];
        const planFields = Array.isArray(planMeta.requirements) ? planMeta.requirements : [];
        const configuredFields = Array.isArray(config?.fields) ? config.fields : [];
        const requirements = configuredFields.length ? configuredFields : (planFields.length ? planFields : productFields);
        const title = config?.title || planMeta.requirement_title || productMeta.requirement_title || 'Datos de activación';
        const notice = config?.notice || planMeta.checkout_notice || productMeta.checkout_notice || '';
        const instructions = config?.instructions || planMeta.checkout_instructions || productMeta.checkout_instructions || '';

        planRequirementMap.set(plan.id, { plan, product, requirements, title, notice, instructions });
        const noticeParts = [notice, instructions, planMeta.delivery_eta_text ? 'Tiempo/estado: ' + planMeta.delivery_eta_text : '', planMeta.customer_chat_message ? 'Mensaje automático: ' + planMeta.customer_chat_message : ''].filter(Boolean);
        if(noticeParts.length){
          specialNotices.push({
            plan_id: plan.id,
            product_name: product.name || 'Producto',
            plan_name: plan.name || 'Plan',
            title,
            text: noticeParts.join('\n\n')
          });
        }
        requirements.forEach(req => {
          specialRequirements.push({
            plan_id: plan.id,
            product_name: product.name || 'Producto',
            plan_name: plan.name || 'Plan',
            key: req.key || 'dato',
            label: req.label || 'Dato requerido',
            type: req.type || 'text',
            required: req.required !== false,
            placeholder: req.placeholder || '',
            help: req.help || '',
            domain: req.domain || '',
            min_length: Number(req.min_length || 0),
            after_payment: req.after_payment !== false,
            title
          });
        });
      });

      specialRequirements = uniqueBy(specialRequirements, x => x.plan_id + '::' + x.key);
      specialNotices = uniqueBy(specialNotices, x => x.plan_id + '::' + x.text);
      renderSpecialRequirements();
    }

    function renderSpecialRequirements(){
      const box = $('specialRequirementsBox');
      if(box) box.classList.add('hidden');
    }

    function collectSpecialInputs(softMode=true){
      const inputs = [];
      let ok = true;
      const summaryLines = [];
      const specialInputs = Array.from(document.querySelectorAll('.special-input'));
      if(!specialInputs.length){ return { ok:true, data:{ items:[] }, summary:'' }; }

      if(specialNotices.length){
        summaryLines.push('AVISOS / INSTRUCCIONES DEL SERVICIO:');
        summaryLines.push(...uniqueBy(specialNotices, x => x.plan_id + '::' + x.text).map(n => `- ${n.product_name} / ${n.plan_name}: ${n.text}`));
      }

      specialInputs.forEach(el => {
        const value = el.value.trim();
        const required = el.dataset.required === '1';
        const domain = (el.dataset.domain || '').toLowerCase();
        const minLength = Number(el.dataset.minLength || 0);
        let valid = true;
        if(!softMode && required && !value) valid = false;
        if(valid && el.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) valid = false;
        if(valid && domain && value && !value.toLowerCase().endsWith('@' + domain)) valid = false;
        if(valid && minLength && value && value.length < minLength) valid = false;
        el.style.borderColor = valid ? '#d0d7e2' : '#dc2626';
        if(!valid) ok = false;
        if(value){
          inputs.push({plan_id: el.dataset.plan, product_name: el.dataset.product, plan_name: el.dataset.planName, key: el.dataset.key, label: el.dataset.label, value});
        }
      });

      if(inputs.length){
        if(summaryLines.length) summaryLines.push('', 'DATOS INGRESADOS POR EL CLIENTE:');
        else summaryLines.push('DATOS INGRESADOS POR EL CLIENTE:');
        inputs.forEach(item => summaryLines.push(`- ${item.product_name} / ${item.plan_name} / ${item.label}: ${item.value}`));
      }

      if(!softMode && !ok) toast('Revisa los datos requeridos. Los servicios de activación solicitan Gmail válido y ChatGPT cuenta personal requiere el texto completo.');
      return { ok, data:{ items:inputs }, summary:summaryLines.join('\n') };
    }
    function activationFieldHtml(req, saved={}){
      const value = String(saved[req.key] || '');
      const common = `class="activation-input" data-key="${esc(req.key)}" data-plan="${esc(req.plan_id || '')}" data-label="${esc(req.label)}" data-product="${esc(req.product_name || 'Producto')}" data-plan-name="${esc(req.plan_name || 'Plan')}" data-required="${req.required ? '1' : '0'}" data-domain="${esc(req.domain || '')}" data-min-length="${Number(req.min_length || 0)}"`;
      const label = `${esc(req.label)}${req.required ? ' *' : ''}`;
      const help = req.help ? `<small>${esc(req.help)}</small>` : '';
      if(String(req.type).toLowerCase() === 'textarea'){
        return `<div class="field"><label>${label}</label><textarea ${common} placeholder="${esc(req.placeholder || '')}">${esc(value)}</textarea>${help}</div>`;
      }
      const type = ['email','tel','number','url','text'].includes(String(req.type).toLowerCase()) ? String(req.type).toLowerCase() : 'text';
      return `<div class="field"><label>${label}</label><input ${common} type="${type}" value="${esc(value)}" placeholder="${esc(req.placeholder || '')}">${help}</div>`;
    }

    function renderActivationBox(show=false){
      const box = $('activationBox'), fields = $('activationFields'), instructions = $('activationInstructions');
      if(!box || !fields || !instructions) return;
      const requirements = specialRequirements.filter(req => req.after_payment !== false);
      const shouldShow = requirements.length > 0 && !!currentOrder?.order_code;
      $('activationShortcutBox')?.classList.toggle('hidden', !shouldShow);
      if(!shouldShow){
        box.classList.add('hidden');
        fields.innerHTML = '';
        instructions.classList.add('hidden');
        return;
      }
      if(!activationBoxOpen && !show){
        box.classList.add('hidden');
        return;
      }
      box.classList.remove('hidden');
      const saved = currentOrder?._activationData || {};
      const titles = uniqueBy(requirements, req => req.title).map(req => req.title).filter(Boolean);
      const notices = uniqueBy(specialNotices, item => item.text).map(item => item.text).filter(Boolean);
      box.querySelector('h4').textContent = '📩 Datos para activar tu servicio';
      box.querySelector('.mini-muted').textContent = titles.length ? titles.join(' · ') : 'Completa los datos solicitados para la activación.';
      if(notices.length){
        instructions.textContent = notices.join('\n\n');
        instructions.classList.remove('hidden');
      }else{
        instructions.textContent = '';
        instructions.classList.add('hidden');
      }
      fields.innerHTML = requirements.map(req => activationFieldHtml(req, saved)).join('');
      $('activationResult').innerHTML = currentOrder?._activationSent ? '<div class="alert-ok">✅ Datos enviados correctamente al administrador.</div>' : '';
    }

    function collectActivationInputs(){
      const elements = Array.from(document.querySelectorAll('.activation-input'));
      if(!elements.length) return {ok:true, data:{items:[]}, summary:''};
      const data = [];
      let ok = true;
      elements.forEach(el => {
        const value = String(el.value || '').trim();
        const required = el.dataset.required === '1';
        const domain = String(el.dataset.domain || '').trim().toLowerCase();
        const minLength = Number(el.dataset.minLength || 0);
        const type = String(el.type || '').toLowerCase();
        let valid = true;
        if(required && !value) valid = false;
        if(valid && type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) valid = false;
        if(valid && domain && value && !value.toLowerCase().endsWith('@' + domain)) valid = false;
        if(valid && minLength && value.length < minLength) valid = false;
        el.style.borderColor = valid ? '#cbd5e1' : '#dc2626';
        if(!valid) ok = false;
        if(value){
          data.push({
            plan_id: el.dataset.plan,
            product_name: el.dataset.product,
            plan_name: el.dataset.planName,
            key: el.dataset.key,
            label: el.dataset.label,
            value
          });
        }
      });
      if(!ok){ toast('Revisa los datos requeridos antes de continuar.'); return {ok:false, data:{items:data}, summary:''}; }
      const summary = data.map(item => `- ${item.product_name} / ${item.plan_name} / ${item.label}: ${item.value}`).join('\n');
      return {ok:true, data:{items:data}, summary};
    }

    async function sendActivationData(){
      if(!currentOrder?.order_code){toast('Primero genera el pedido.');return}
      const phone=($('phone').value.trim()||currentOrder._phone||$('lookupPhone').value.trim());
      if(!phone){toast('Falta WhatsApp para validar el pedido.');return}
      const payload=collectActivationInputs();
      if(!payload.ok)return;
      const btn=$('btnSendActivationData'); btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Enviando...';
      const r=await db.rpc('update_order_customer_inputs_public',{p_order_code:currentOrder.order_code,p_customer_whatsapp:phone,p_customer_inputs:payload.data,p_requirement_summary:payload.summary});
      btn.disabled=false; btn.innerHTML='<i class="fa fa-paper-plane"></i> Guardar correo';
      if(r.error){toast(r.error.message);return}
      currentOrder._activationSent = true;
      currentOrder._activationData = Object.fromEntries((payload.data.items || []).map(item => [item.key, item.value]));
      persistOrder();
      $('activationResult').innerHTML='<div class="alert-ok">✅ Datos enviados correctamente al administrador.</div>';
      broadcastCheckoutDataChanged('order_customer_inputs', 'RPC');
      await notifyTelegram('activation_data', { message: payload.summary });
      await checkStatus({target:'statusBox',silent:true});
    }

    function renderChat(messages){
      const box = $('orderChatBox');
      const list = $('orderChatList');
      if(!box || !list) return;
      box.classList.toggle('hidden', !currentOrder?.order_code || chatMinimized);
      const arr = Array.isArray(messages) ? messages : [];
      list.innerHTML = arr.length ? arr.map(m => `
        <div class="chat-msg ${esc(m.role||'system')}">
          <b>${esc(m.name || (m.role==='admin'?'Soporte':'Cliente'))}</b>
          <span class="mini-muted"> · ${m.created_at ? new Date(m.created_at).toLocaleString() : ''}</span>
          <div style="white-space:pre-wrap">${esc(m.message||'')}</div>
        </div>`).join('') : '<div class="mini-muted">Aún no hay mensajes.</div>';
      list.scrollTop = list.scrollHeight;
    }

    async function sendChatMessage(){
      if(!currentOrder?.order_code){ toast('Primero genera el pedido.'); return; }
      const msg = $('orderChatInput').value.trim();
      if(!msg){ toast('Escribe un mensaje.'); return; }
      const phone = $('phone').value.trim() || currentOrder?._phone || $('lookupPhone').value.trim();
      const r = await db.rpc('public_send_order_message', {
        p_order_code: currentOrder.order_code,
        p_customer_whatsapp: phone,
        p_message: msg
      });
      if(r.error){ toast(r.error.message); return; }
      broadcastCheckoutDataChanged('order_chat_messages', 'RPC');
      $('orderChatInput').value = '';
      await checkStatus({target:'statusBox', silent:true});
      toast('Mensaje enviado al administrador.');
    }

    async function loadSettings(){
      const r = await db.from('app_settings').select('*').eq('key','payment_public').maybeSingle();
      if(!r.error && r.data?.value){ settings = {...settings, ...r.data.value}; }
      $('paymentNumber').textContent = settings.yape_number || '991564053';
      const qr = $('qrImage');
      const miss = $('qrMissingNote');
      if(qr){
        const qrUrl = String(settings.yape_qr_url || settings.qr_url || settings.yape_qr || settings.qr || '').trim();
        qr.onload = () => { qr.hidden=false; qr.style.display='block'; miss?.classList.add('hidden'); };
        qr.onerror = () => { qr.hidden=true; qr.style.display='none'; miss?.classList.remove('hidden'); };
        if(qrUrl){
          qr.hidden=false;
          qr.style.display='block';
          qr.removeAttribute('crossorigin');
          qr.src = qrUrl;
        }else{
          qr.hidden=true;
          qr.style.display='none';
          miss?.classList.remove('hidden');
        }
      }
    }
    async function detectDeliveryMode(){
      const ids = [...new Set(cartDbItems().map(x => x.plan_id))];
      let rows = [];
      if(ids.length){
        const response = await db.from('product_plans').select('id,stock_mode,delivery_mode,delivery_eta_minutes').in('id', ids);
        if(!response.error) rows = response.data || [];
      }
      if(!rows.length){
        rows = cart.map(item => ({
          id: item.plan_id || item.planId || '',
          stock_mode: item?.meta?.stock_mode || item.stock_mode || '',
          delivery_mode: item?.meta?.delivery_mode || item.delivery_mode || 'manual',
          delivery_eta_minutes: item?.meta?.delivery_eta_minutes || item.delivery_eta_minutes || null
        }));
      }
      const modes = rows.map(row => (String(row.stock_mode || '').toLowerCase() === 'controlled' || ['auto','automatic'].includes(String(row.delivery_mode || '').toLowerCase())) ? 'auto' : 'manual');
      const unique = [...new Set(modes.filter(Boolean))];
      const eta = Math.max(0, ...rows.map(row => Number(row.delivery_eta_minutes || 0)).filter(Number.isFinite));
      if(unique.length === 1 && unique[0] === 'auto'){
        deliverySummary = { type:'auto', label:'Entrega automática', help: eta ? `Se entrega al aprobar el pago. Tiempo estimado: hasta ${eta} min.` : 'Se entrega automáticamente cuando el pago sea aprobado.' };
      }else if(unique.length > 1){
        deliverySummary = { type:'mixed', label:'Entrega mixta', help:'Tu compra combina productos automáticos y productos que requieren atención del administrador.' };
      }else{
        deliverySummary = { type:'manual', label:'Entrega manual', help:'El administrador registrará la cuenta o activación luego de validar el pago.' };
      }
      renderDeliveryMode();
    }

    function renderDeliveryMode(){
      const badge = $('deliveryModeBadge');
      if(!badge) return;
      badge.classList.toggle('manual', deliverySummary.type === 'manual');
      badge.classList.toggle('mixed', deliverySummary.type === 'mixed');
      badge.classList.toggle('auto', deliverySummary.type === 'auto');
      const icon = deliverySummary.type === 'auto' ? 'fa-bolt' : deliverySummary.type === 'mixed' ? 'fa-random' : 'fa-user-check';
      badge.innerHTML = `<i class="fa ${icon}"></i> ${esc(deliverySummary.label)}`;
      $('deliveryModeHelp').textContent = deliverySummary.help;
    }

    function renderCart(totals){
      const orderRef = totals && typeof totals === 'object' ? totals : currentOrder;
      cart = readCart();
      const liveCount = countItems(cart);
      const summaryItems = getSummaryItems(orderRef);
      const summaryCount = countItems(summaryItems);
      const showingOrderSummary = !cart.length && !!orderRef?._cartSnapshot?.length;
      document.querySelectorAll('[data-innov-cart-count]').forEach(el=>el.textContent=String(liveCount));
      $('itemsCountText').textContent = summaryCount + ' item' + (summaryCount === 1 ? '' : 's');
      $('emptyNote').classList.toggle('hidden', summaryItems.length > 0);
      $('emptyNote').innerHTML = showingOrderSummary
        ? 'Estás viendo el resumen del pedido generado.'
        : 'Tu carrito está vacío. <a href="shop.html">Ir a la tienda</a>';
      $('checkoutProducts').classList.toggle('is-order-summary', showingOrderSummary);
      $('checkoutProducts').innerHTML = summaryItems.map(i => `
        <div class="item">
          <div class="item-left">
            <img class="thumb" src="${esc(i.imagen || i.image || 'assets/img/product-placeholder.svg')}" onerror="this.src='assets/img/product-placeholder.svg'">
            <div><div class="item-name">${esc(i.nombre || 'Producto')}</div><div class="item-meta">${esc(i.plan_name || i.plan || 'Plan')} · Cantidad: ${Number(i.qty||1)}</div></div>
          </div>
          <b>${money(Number(i.precio||0)*Number(i.qty||1))}</b>
        </div>`).join('');
      const summarySubtotal = subtotalFromItems(summaryItems);
      const sub = totals ? Number(totals.subtotal ?? totals._cartSubtotal ?? summarySubtotal) : summarySubtotal;
      const disc = totals ? Number(totals.discount_amount ?? totals._discountAmount ?? 0) : (couponPreview ? Number(couponPreview.amount||0) : 0);
      const total = totals ? Number(totals.total ?? Math.max(0, sub - disc)) : Math.max(0, sub - disc);
      $('subtotalText').textContent = money(sub);
      $('totalText').textContent = money(total);
      $('discountRow').classList.toggle('hidden', disc <= 0);
      $('discountText').textContent = '- ' + money(disc);
      $('discountCodeLabel').textContent = currentCoupon ? '(' + currentCoupon + ')' : '';
      syncCheckoutAvailability(summaryItems);
    }

    async function applyCoupon(){
      const code = $('couponInput').value.trim().toUpperCase();
      if(!code){ toast('Escribe un cupón.'); return; }
      currentCoupon = code;
      couponPreview = null;
      try{ sessionStorage.setItem(APPLIED_COUPON_KEY, JSON.stringify({ code })); }catch(e){}
      $('couponHelp').textContent = 'Cupón guardado. El servidor validará vigencia, usos, compra mínima y alcance al generar el pedido.';
      renderCart();
      toast('Cupón guardado para validación segura.');
    }

    function persistOrder(){
      if(currentOrder){
        currentOrder._phone = $('phone').value.trim() || currentOrder._phone || $('lookupPhone').value.trim();
        currentOrder._cartSig = cartSignature();
        sessionStorage.setItem(CURRENT_ORDER_KEY, JSON.stringify(currentOrder));
      }
    }
    function clearCurrentOrderLocal(){
      currentOrder=null; sessionStorage.removeItem(CURRENT_ORDER_KEY); stopOrderRealtime();
    }
    function showFormView(){
      stopOrderRealtime();
      clearCurrentOrderLocal();
      $('generatedView').classList.add('hidden');
      $('formView').classList.remove('hidden');
      $('mainCardTitle').textContent='🧾 Datos para generar pedido';
      setStep(2);
      renderCart();
      window.scrollTo({top:0,behavior:'smooth'});
    }
    function restoreOrder(){
      const saved = safeParse(sessionStorage.getItem(CURRENT_ORDER_KEY), null);
      if(!saved?.order_code) return;
      const sig=cartSignature();
      if(cart.length && saved._cartSig && saved._cartSig!==sig){
        sessionStorage.removeItem(CURRENT_ORDER_KEY);
        return;
      }
      if(!saved._phone && !$('phone').value.trim()){
        sessionStorage.removeItem(CURRENT_ORDER_KEY);
        return;
      }
      currentOrder = saved;
      if(saved._phone){ $('phone').value=saved._phone; $('lookupPhone').value=saved._phone; }
      renderCart(currentOrder);
      showGeneratedView(currentOrder, false);
      startOrderRealtime();
      checkStatus({ target:'statusBox', silent:true });
    }

    function showGeneratedView(order, scroll=true){
      $('formView').classList.add('hidden');
      $('generatedView').classList.remove('hidden');
      $('mainCardTitle').textContent = '📌 Pedido generado';
      $('orderCodeText').textContent = order.order_code;
      $('orderTotalText').textContent = money(order.total);
      $('lookupOrderCode').value = order.order_code;
      const phone=order._phone || $('phone').value.trim();
      if(phone && !$('lookupPhone').value) $('lookupPhone').value = phone;
      setStep(3);
      activationBoxOpen = false; renderActivationBox(false);
      if(scroll) $('mainCard').scrollIntoView({behavior:'smooth', block:'start'});
    }

    async function generateOrder(){
      cart = readCart();
      if(!cart.length){ toast('Tu carrito está vacío.'); return; }
      const name = $('fullName').value.trim();
      const phone = $('phone').value.trim();
      const country = $('country').value;
      if(!name || !phone || !country){ toast('Completa nombre, celular y país.'); return; }
      if(!$('terms').checked){ toast('Acepta los términos para continuar.'); return; }
      const items = cartDbItems();
      if(!items.length){ toast('Tus productos no están conectados a Supabase. Agrégalos otra vez desde la tienda.'); return; }
      const special = collectSpecialInputs(true);
      const btn = $('btnGenerateOrder');
      btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Generando...';
      const r = await db.rpc('create_public_order_v2', {
        p_customer_name:name,
        p_customer_whatsapp:phone,
        p_customer_email:'',
        p_delivery_method:deliverySummary.label,
        p_country:country,
        p_payment_method:'yape_manual',
        p_coupon_code:currentCoupon,
        p_items:items,
        p_customer_inputs:special.data,
        p_requirement_summary:special.summary
      });
      btn.disabled = false; btn.innerHTML = '<i class="fa fa-qrcode"></i> Generar pedido y pagar';
      if(r.error){ toast(r.error.message); return; }
      const cartSnapshot = cloneItems(cart);
      const cartSubtotalValue = subtotalFromItems(cartSnapshot);
      const discountAmount = Number(couponPreview?.amount || 0);
      currentOrder = {
        ...r.data[0],
        _phone:phone,
        _cartSig:cartSignature(),
        _paymentSent:false,
        _activationSent:false,
        _cartSnapshot:cartSnapshot,
        _cartSubtotal:cartSubtotalValue,
        _discountAmount:discountAmount,
        _couponCode:currentCoupon || ''
      };
      startOrderRealtime();

      // Respaldo: guarda los correos/datos requeridos en order_customer_inputs aunque la función de creación antigua no los registre.
      // Si ya fueron guardados por create_public_order_v2, esta llamada solo actualiza el mismo registro.
      try{
        if(special.summary){
          await db.rpc('update_order_customer_inputs_public',{
            p_order_code:currentOrder.order_code,
            p_customer_whatsapp:phone,
            p_customer_inputs:special.data,
            p_requirement_summary:special.summary
          });
        }
      }catch(e){ console.warn('No se pudo guardar datos especiales de respaldo:', e); }

      persistOrder();
      broadcastCheckoutDataChanged('orders', 'RPC');
      void notifyTelegram('order_created', {order_code:currentOrder.order_code});
      renderCart(currentOrder);
      showGeneratedView(currentOrder);
      try{ sessionStorage.removeItem(CART_KEY); localStorage.removeItem(CART_KEY); }catch(e){}
      document.querySelectorAll('[data-innov-cart-count]').forEach(el=>el.textContent='0');
      toast('Pedido generado. Guarda tu ID y realiza el pago.');
    }

    
    async function cancelCurrentOrder(){
      if(!currentOrder?.order_code){ showFormView(); return; }
      if(!confirm('¿Cancelar este pedido? Si ya pagaste, no lo canceles y espera revisión.')) return;
      const phone = $('phone').value.trim() || currentOrder._phone || $('lookupPhone').value.trim();
      const r = await db.rpc('public_cancel_order',{p_order_code:currentOrder.order_code,p_customer_whatsapp:phone});
      if(r.error){ toast(r.error.message); return; }
      broadcastCheckoutDataChanged('orders', 'RPC');
      clearCurrentOrderLocal();
      $('generatedView').classList.add('hidden');
      $('formView').classList.remove('hidden');
      $('mainCardTitle').textContent='🧾 Datos para generar pedido';
      setStep(2);
      renderCart();
      toast('Pedido cancelado. Puedes editar tus datos o hacer otra compra.');
    }

async function sendPaymentReview(){
      if(!currentOrder?.order_code){ toast('Primero genera el pedido.'); return; }
      const operation = $('operationCode').value.trim();
      if(!operation){ toast('Coloca el código de operación.'); return; }
      const phone = $('phone').value.trim() || currentOrder._phone || $('lookupPhone').value.trim();
      if(!phone){ toast('Falta WhatsApp para validar el pedido.'); return; }
      const activationRequired = specialRequirements.some(req => req.after_payment !== false && req.required);
      if(activationRequired && !currentOrder._activationSent){
        activationBoxOpen = true;
        renderActivationBox(true);
        $('activationBox')?.scrollIntoView({behavior:'smooth', block:'center'});
        toast('Completa primero los datos de activación solicitados.');
        return;
      }

      const btn=$('btnSendReview');
      btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Enviando...';

      const r = await db.rpc('report_payment_public', {
        p_order_code:currentOrder.order_code,
        p_customer_whatsapp:phone,
        p_operation_code:operation,
        p_customer_note:$('customerNote').value.trim(),
        p_proof_image_url:''
      });

      btn.disabled=false; btn.innerHTML='<i class="fa fa-paper-plane"></i> Enviar pago a revisión';

      if(r.error){ toast(r.error.message); return; }
      currentOrder._paymentSent=true; persistOrder();
      broadcastCheckoutDataChanged('payment_proofs', 'RPC');
      setStep(4);
      $('statusBox').innerHTML = '<div class="alert-wait">Pago enviado a revisión. Se actualizará automáticamente cuando el administrador libere la entrega.</div>';
      startOrderRealtime();
      await notifyTelegram('payment_review', { operation_code: operation, message: $('customerNote').value.trim() });
      await checkStatus({ target:'statusBox', silent:true });
      toast('Pago enviado a revisión.');
    }

    function getActiveOrderCode(){ return String(currentOrder?.order_code || $('lookupOrderCode')?.value || '').trim().toUpperCase(); }
    function getActiveOrderPhone(){ return String($('phone')?.value || currentOrder?._phone || $('lookupPhone')?.value || '').trim(); }
    function scheduleOrderRealtimeCheck(reason='change'){
      if(document.hidden){ orderRealtimePending = true; return; }
      clearTimeout(orderRealtimeTimer);
      orderRealtimeTimer = setTimeout(()=>{
        if(document.hidden){ orderRealtimePending = true; return; }
        const code = getActiveOrderCode();
        const phone = getActiveOrderPhone();
        if(code && phone) checkStatus({ orderCode:code, phone, target:'statusBox', silent:true });
      }, 650);
    }
    function initCheckoutRealtimeBus(){
      if(checkoutDataEventChannel || !db?.channel) return;
      let ch = db.channel(REALTIME_BUS_CHANNEL);
      ch = ch.on('broadcast', { event:'data_changed' }, msg => {
        const p = msg?.payload || {};
        const table = String(p.table || '');
        if(/orders|payment_proofs|deliveries|order_customer_inputs|order_chat_messages|rpc|supabase|change/.test(table)){
          scheduleOrderRealtimeCheck('broadcast');
        }
      });
      ch.subscribe(status=>{
        checkoutDataEventReady = status === 'SUBSCRIBED';
        checkoutDataEventChannel = ch;
        if(checkoutDataEventReady) flushCheckoutBroadcastQueue();
      });
      checkoutDataEventChannel = ch;
    }
    function startOrderRealtime(){
      const code = getActiveOrderCode();
      const orderId = String(currentOrder?.id || currentOrder?.order_id || '').trim();
      if(!code || !db?.channel) return;
      stopOrderRealtime();
      let channel = db.channel('innov-checkout-a-' + code + '-' + Date.now());
      try{
        channel = channel.on('postgres_changes', { event:'*', schema:'public', table:'orders', filter:`order_code=eq.${code}` }, () => scheduleOrderRealtimeCheck('orders'));
        if(orderId){
          ['payment_proofs','deliveries','order_customer_inputs','order_chat_messages'].forEach(table => {
            channel = channel.on('postgres_changes', { event:'*', schema:'public', table, filter:`order_id=eq.${orderId}` }, () => scheduleOrderRealtimeCheck(table));
          });
        }
        channel.subscribe();
        orderRealtimeChannel = channel;
        startOrderStatusPolling();
      }catch(error){ console.warn('No se pudo iniciar Realtime del pedido:', error); }
    }
    function stopOrderRealtime(){
      stopOrderStatusPolling();
      clearTimeout(orderRealtimeTimer);
      orderRealtimeTimer = null;
      orderRealtimePending = false;
      if(orderRealtimeChannel){
        try{ db.removeChannel(orderRealtimeChannel); }catch(e){}
        orderRealtimeChannel = null;
      }
    }
    document.addEventListener('visibilitychange', ()=>{
      if(!document.hidden && orderRealtimePending){
        orderRealtimePending = false;
        scheduleOrderRealtimeCheck('resume');
      }
    });
    window.addEventListener('focus', ()=>{
      if(orderRealtimePending){
        orderRealtimePending = false;
        scheduleOrderRealtimeCheck('focus');
      }
    });
    function statusLabel(value){
      const status = String(value || '').toLowerCase();
      if(/cancel|reject|recha/.test(status)) return 'Cancelado o rechazado';
      if(/deliver|entreg|complete|liberad/.test(status)) return 'Entrega completada';
      if(/approv|aprob|paid|pagad|valid/.test(status)) return 'Pago aprobado';
      if(/review|revision|proof|report/.test(status)) return 'Pago en revisión';
      if(/pending/.test(status)) return 'Pendiente de pago';
      return value || 'En proceso';
    }

    function currentOrderStage(info, delivered){
      const text = `${info?.status || ''} ${info?.delivery_status || ''}`.toLowerCase();
      if(delivered || /deliver|entreg|complete|liberad/.test(text)) return 4;
      if(/approv|aprob|paid|pagad|valid/.test(text)) return 3;
      if(/review|revision|proof|report/.test(text)) return 2;
      return 1;
    }

    function orderProgressHtml(info, delivered){
      const stage = currentOrderStage(info, delivered);
      const steps = [
        ['Pedido generado', 'fa-receipt'],
        ['Pago enviado', 'fa-credit-card'],
        ['Validación', 'fa-shield-alt'],
        ['Entrega lista', 'fa-check-circle']
      ];
      return `<div class="order-progress" aria-label="Estado del pedido">${steps.map((step, index) => {
        const number = index + 1;
        const css = number < stage ? 'done' : number === stage ? 'active' : '';
        return `<div class="progress-step ${css}"><span class="progress-icon"><i class="fa ${step[1]}"></i></span><span>${step[0]}</span></div>`;
      }).join('')}</div>`;
    }

    async function getDeliveryFallback(orderCode, phone){
      try{
        const response = await db.rpc('get_public_order_delivery_v81', {
          p_order_code: String(orderCode || '').trim().toUpperCase(),
          p_customer_whatsapp: String(phone || '').trim()
        });
        if(response.error) return null;
        return Array.isArray(response.data) ? response.data[0] : response.data;
      }catch(error){
        console.warn('No se pudo consultar el respaldo de entrega:', error);
        return null;
      }
    }
    function startOrderStatusPolling(){
      clearInterval(orderStatusPollTimer);
      orderStatusPollTimer = setInterval(()=>{
        if(document.hidden) return;
        const code = getActiveOrderCode();
        const phone = getActiveOrderPhone();
        if(code && phone) checkStatus({ orderCode:code, phone, target:'statusBox', silent:true });
      }, 15000);
    }
    function stopOrderStatusPolling(){
      clearInterval(orderStatusPollTimer);
      orderStatusPollTimer = null;
    }
    window.refreshDeliveryStatus = function(){
      const code = getActiveOrderCode();
      const phone = getActiveOrderPhone();
      if(!code || !phone){ toast('Ingresa tu ID de pedido y WhatsApp.'); return; }
      checkStatus({ orderCode:code, phone, target:'statusBox', silent:false });
    };

    async function checkStatus(opts={}){
      if(!opts.silent) chatMinimized = false;
      const orderCode = (opts.orderCode || currentOrder?.order_code || $('lookupOrderCode').value || '').trim().toUpperCase();
      const phone = (opts.phone || $('phone').value || currentOrder?._phone || $('lookupPhone').value || '').trim();
      const target = opts.target || 'lookupResult';
      if(!orderCode || !phone){ if(!opts.silent) toast('Coloca ID de pedido y WhatsApp.'); return; }
      const box = $(target);
      if(!opts.silent) box.innerHTML = '<div class="mini-muted">Consultando pedido...</div>';
      const response = await db.rpc('get_public_order_status_v2', { p_order_code:orderCode, p_customer_whatsapp:phone });
      let info = response.data?.[0] || null;
      const fallback = await getDeliveryFallback(orderCode, phone);
      if(fallback){
        info = {
          ...(info || {}),
          ...fallback,
          deliveries: Array.isArray(fallback.deliveries) && fallback.deliveries.length
            ? fallback.deliveries
            : (info?.deliveries || [])
        };
      }
      if(response.error && !info){
        if(!opts.silent) box.innerHTML = '<div class="alert-wait">' + esc(response.error.message) + '</div>';
        return;
      }
      if(!info){ box.innerHTML = '<div class="alert-wait">No se encontró información.</div>'; return; }
      currentOrder = {...(currentOrder || {}), ...info, order_code: orderCode, _phone: phone};
      if(info.status && info.status !== 'pending_payment') currentOrder._paymentSent = true;
      persistOrder();
      renderCart(currentOrder);
      renderActivationBox(true);
      const delivered = Array.isArray(info.deliveries) && info.deliveries.length > 0;
      let content = `<div class="order-status-card ${delivered ? 'complete' : ''}"><div class="status-title"><span><i class="fa ${delivered ? 'fa-check-circle' : 'fa-clock'}"></i> ${delivered ? 'Entrega disponible' : statusLabel(info.status || info.delivery_status)}</span><span class="status-code">${esc(orderCode)}</span></div><div class="status-grid"><span><b>Pago:</b> ${esc(statusLabel(info.status))}</span><span><b>Entrega:</b> ${esc(statusLabel(info.delivery_status))}</span><span><b>Total:</b> ${money(info.total)}</span></div>${orderProgressHtml(info, delivered)}</div>`;
      renderChat(info.chat_messages || []);
      if(info.requirement_summary){
        content += `<div class="special-box" style="margin-top:10px"><b>📌 Datos registrados para activación</b><div style="white-space:pre-wrap;margin-top:5px">${esc(info.requirement_summary)}</div></div>`;
      }
      const stateText = `${info.status || ''} ${info.delivery_status || ''}`.toLowerCase();
      if(/rejected|cancelled/.test(stateText)){
        content += '<div class="alert-wait" style="margin-top:10px"><b>❌ Pedido no disponible</b><br>El pedido fue rechazado o cancelado. Si necesitas ayuda, utiliza el soporte de pedido.</div>';
        stopOrderRealtime();
        clearCurrentOrderLocal();
      }else if(delivered){
        const deliveryText = buildDeliveryText(info, orderCode);
        content += '<div class="delivery-ready"><div class="delivery-ready-head"><b>✅ Entrega de tu servicio</b><span>Plantilla oficial del servicio</span></div>';
        content += `<div class="delivery-data">${esc(deliveryText)}</div>`;
        content += `<div class="download-row"><button class="btn btn-primary btn-small" onclick="downloadDeliveryTxt('${esc(orderCode)}')"><i class="fa fa-download"></i> Guardar entrega</button><button class="btn btn-small" onclick="refreshDeliveryStatus()"><i class="fa fa-sync"></i> Actualizar</button></div></div>`;
        stopOrderRealtime(); clearCart(); renderCart(); clearCurrentOrderLocal(); try{sessionStorage.removeItem(APPLIED_COUPON_KEY);}catch(_){} setStep(4);
      }else{
        content += `<div class="status-note"><i class="fa fa-info-circle"></i> ${esc(deliverySummary.help || 'Tu pedido se actualizará cuando se valide el pago.')}</div>`;
      }
      box.innerHTML = content;
    }

    function buildDeliveryText(info, code){
      const name = $('fullName').value.trim() || info.customer_name || '';
      const phone = $('phone').value.trim() || $('lookupPhone').value.trim() || '';
      const date = new Date().toLocaleString();
      const items = cart.map(item => `- ${item.nombre || 'Producto'} ${item.plan_name ? '(' + item.plan_name + ')' : ''} x${item.qty || 1}`).join('\n') || '- Producto comprado';
      const deliveries = (info.deliveries || []).map(delivery => delivery.message || delivery.delivered_message || '').filter(Boolean).join('\n\n────────────────────\n\n');
      return `INNOV IA TIENDA\nID del pedido: ${code}\nFecha de consulta: ${date}\nCliente: ${name}\nWhatsApp: ${phone}\nTotal: ${money(info.total)}\n\nProductos:\n${items}\n\nDatos de entrega:\n${deliveries || 'La entrega está siendo preparada.'}`;
    }

    window.downloadDeliveryTxt = function(code){
      const statusText = document.querySelector('.delivery-data')?.textContent || '';
      if(!statusText){ toast('Aún no hay entrega para descargar.'); return; }
      const blob = new Blob([statusText], {type:'text/plain;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pedido-${code || 'innov-ia'}-entrega.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    function openSupportModal(){
      $('supportModal')?.classList.remove('hidden');
      $('supportResult').innerHTML='';
    }
    function closeSupportModal(){ $('supportModal')?.classList.add('hidden'); }
    function fillSupportFromCurrent(){
      if(currentOrder?.order_code) $('supportOrderCode').value = currentOrder.order_code;
      const phone = $('phone').value.trim() || currentOrder?._phone || $('lookupPhone').value.trim();
      if(phone) $('supportPhone').value = phone;
      if(!$('supportReason').value.trim()) $('supportReason').value = 'Necesito ayuda con mi pedido / activación.';
    }
    async function sendSupportRequest(){
      const orderCode = $('supportOrderCode').value.trim().toUpperCase();
      const phone = $('supportPhone').value.trim();
      const reason = $('supportReason').value.trim() || 'Necesito soporte con mi pedido.';
      if(!orderCode || !phone){ $('supportResult').innerHTML='<div class="alert-wait">Completa el ID del pedido y el WhatsApp registrado.</div>'; return; }
      $('supportResult').innerHTML='<div class="mini-muted">Validando pedido...</div>';
      const verify = await db.rpc('get_public_order_status_v2', { p_order_code:orderCode, p_customer_whatsapp:phone });
      if(verify.error || !verify.data?.[0]){ $('supportResult').innerHTML='<div class="alert-wait">No pudimos validar ese pedido con ese WhatsApp.</div>'; return; }
      const info = verify.data[0];
      currentOrder = Object.assign({}, currentOrder||{}, { order_code: orderCode, _phone: phone, total: info.total || currentOrder?.total || 0, _cartSig: currentOrder?._cartSig || '' });
      persistOrder();
      startOrderRealtime();
      try{
        await db.rpc('public_send_order_message', {
          p_order_code: orderCode,
          p_customer_whatsapp: phone,
          p_message: '🆘 Solicitud de soporte desde la ventana flotante. ' + reason
        });
      }catch(e){}
      $('lookupOrderCode').value = orderCode;
      $('lookupPhone').value = phone;
      await notifyTelegram('support_request', { order_code:orderCode, message:reason });
      chatMinimized = false;
      closeSupportModal();
      $('formView')?.classList.add('hidden');
      $('generatedView')?.classList.remove('hidden');
      setStep(3);
      await checkStatus({ orderCode, phone, target:'statusBox', silent:true });
      $('orderChatBox')?.classList.remove('hidden');
      $('orderChatBox')?.scrollIntoView({behavior:'smooth', block:'start'});
      toast('Pedido validado. Ya puedes chatear con soporte.');
    }

    document.querySelectorAll('.agent-btn').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('.agent-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      toast('Agente seleccionado.');
    }));
    $('btnApplyCoupon').addEventListener('click', applyCoupon);
    $('couponInput').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); applyCoupon(); }});
    $('btnGenerateOrder').addEventListener('click', generateOrder);
    $('btnSendReview').addEventListener('click', sendPaymentReview);
      $('btnBackToData')?.addEventListener('click', showFormView);
      $('btnCancelOrder')?.addEventListener('click', cancelCurrentOrder);
      $('btnSendActivationData')?.addEventListener('click', sendActivationData);
      $('btnGoActivation')?.addEventListener('click', ()=>{ activationBoxOpen = true; renderActivationBox(true); $('activationBox')?.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(()=>document.querySelector('.activation-input')?.focus(),80); });
    $('btnLookupOrder').addEventListener('click', ()=>checkStatus({ orderCode:$('lookupOrderCode').value, phone:$('lookupPhone').value, target:'lookupResult' }));
    $('btnSendChatMessage')?.addEventListener('click', sendChatMessage);
    $('btnOpenSupport')?.addEventListener('click', openSupportModal);
    $('btnCloseSupport')?.addEventListener('click', closeSupportModal);
    $('btnSupportFillCurrent')?.addEventListener('click', fillSupportFromCurrent);
    $('btnSendSupportRequest')?.addEventListener('click', sendSupportRequest);
    $('btnMinimizeChat')?.addEventListener('click', ()=> { chatMinimized = true; $('orderChatBox')?.classList.add('hidden'); toast('Chat minimizado. Se volverá a mostrar al consultar el pedido.'); });
    $('orderChatInput')?.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); sendChatMessage(); }});

    async function init(){
      cart = readCart();
      const savedCoupon = safeParse(sessionStorage.getItem(APPLIED_COUPON_KEY), null);
      if(savedCoupon?.code){ currentCoupon = savedCoupon.code; $('couponInput').value = currentCoupon; }
      await loadSettings();
      initCheckoutRealtimeBus();
      renderCart();
      await detectDeliveryMode();
      await loadSpecialRequirements();
      restoreOrder();
      if(currentOrder?.order_code){ renderActivationBox(true); startOrderRealtime(); checkStatus({ target:'statusBox', silent:true }); }
    }
    init();

/* module: innov-safe-shell-script */
(function(){
  function q(sel,root){return (root||document).querySelector(sel)}
  function syncCart(){
    var count=0;
    try{var raw=sessionStorage.getItem('innov_cart_v1')||localStorage.getItem('innov_cart_v1')||'[]';var items=JSON.parse(raw);count=(items||[]).reduce(function(n,x){return n+Number(x&&x.qty||0)},0)}catch(e){}
    document.querySelectorAll('[data-innov-cart-count]').forEach(function(el){el.textContent=String(count)});
  }
  function openDialog(id){var d=document.getElementById(id);if(!d)return;try{d.showModal()}catch(e){d.setAttribute('open','')}}
  function closeDialog(id){var d=document.getElementById(id);if(!d)return;try{d.close()}catch(e){d.removeAttribute('open')}}
  document.addEventListener('click',function(e){var opener=e.target.closest('[data-innov-open]');if(opener){e.preventDefault();openDialog(opener.getAttribute('data-innov-open'));return}var closer=e.target.closest('[data-innov-close]');if(closer){e.preventDefault();closeDialog(closer.getAttribute('data-innov-close'));return}var dialog=e.target;if(dialog&&dialog.classList&&dialog.classList.contains('innov-safe-modal')&&e.target===dialog){try{dialog.close()}catch(err){dialog.removeAttribute('open')}}});
  var menu=q('#innovSafeMenu'),header=q('#innovSafeHeader');if(menu&&header){menu.addEventListener('click',function(){var on=header.classList.toggle('is-open');menu.setAttribute('aria-expanded',on?'true':'false')})}
  syncCart();window.addEventListener('storage',syncCart);window.addEventListener('focus',syncCart);document.addEventListener('visibilitychange',function(){if(!document.hidden)syncCart()});
  ['headerCartBadge','headerCartBadgeSm','headerCartBadge2'].forEach(function(id){var old=document.getElementById(id);if(old&&window.MutationObserver){new MutationObserver(syncCart).observe(old,{childList:true,characterData:true,subtree:true})}});
})();
