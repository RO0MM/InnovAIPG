(()=>{
  'use strict';
  const SUPABASE_URL='https://rfjvskrimsoqlyofhidj.supabase.co';
  const SUPABASE_KEY='sb_publishable_P1cgsqPGMWHHWIujJayyqg_9hgJEXZh';
  const SESSION_KEY='innov_portal_session';
  const SNAPSHOT_KEY='innov_portal_snapshot';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let db=null;
  let sessionToken=localStorage.getItem(SESSION_KEY)||'';
  let home=null;
  let activeAssignmentId=null;
  let totpTimer=null;
  let secureClock={ready:false,anchorServerMs:0,anchorPerfMs:0,syncedAt:0,syncing:null};

  const views={login:$('loginView'),profile:$('profileView'),dashboard:$('dashboardView')};

  function showView(name){
    Object.entries(views).forEach(([key,el])=>{if(el)el.hidden=key!==name});
    document.body.dataset.portalStage=name;
    $('portalLogout').hidden=name==='login';
    window.scrollTo({top:0,behavior:'instant'});
  }
  function msg(el,text,type='err'){
    if(!el)return;
    el.hidden=!text;
    el.className='portal-msg '+type;
    el.textContent=text||'';
  }
  function setBusy(btn,busy,label){
    if(!btn)return;
    btn.disabled=busy;
    if(!btn.dataset.label)btn.dataset.label=btn.innerHTML;
    btn.innerHTML=busy?`<i class="fa-solid fa-circle-notch fa-spin"></i> ${label||'Procesando…'}`:btn.dataset.label;
  }
  function fmtDate(value){
    if(!value)return'—';
    const d=new Date(String(value).slice(0,10)+'T12:00:00');
    return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric'}).format(d);
  }
  function ensureDb(){
    if(!window.supabase?.createClient)throw new Error('No se pudo cargar la conexión segura.');
    if(!db)db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    return db;
  }
  async function rpc(name,args){
    const {data,error}=await ensureDb().rpc(name,args);
    if(error)throw new Error(error.message||'No se pudo completar la operación.');
    return data;
  }
  function saveSnapshot(data){
    const customer=data?.customer||{};
    const snapshot={
      checked_at:Date.now(),
      profile_complete:Boolean(customer.profile_complete),
      customer:{name:customer.name||'',email:customer.email||'',phone:customer.phone||'',phone_masked:customer.phone_masked||'',username:customer.username||''}
    };
    localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(snapshot));
  }
  async function login(identifier){return rpc('portal_login',{p_identifier:identifier})}
  async function loadHome(){
    const data=await rpc('portal_get_home',{p_session_token:sessionToken});
    if(!data?.ok){if(data?.expired)logout(false);throw new Error(data?.message||'No se pudo cargar tu cuenta.');}
    home=data;
    saveSnapshot(data);
    return data;
  }
  function fillProfile(customer){
    $('profileName').value=customer?.name||'';
    $('profileEmail').value=customer?.email||'';
    $('birthdayDay').value=customer?.birthday_day||'';
    $('birthdayMonth').value=customer?.birthday_month||'';
    document.querySelectorAll('.portal-interests input').forEach(input=>{input.checked=(customer?.interests||[]).includes(input.value)});
    $('profileIdentity').textContent=customer?.username||customer?.phone_masked||'Tu registro Innov IA';
  }

  function serviceState(service){
    if(service?.portal_state)return service.portal_state;
    const status=String(service?.status||'active').toLowerCase();
    if(['cancelled','canceled','completed','inactive','archived'].includes(status))return'history';
    const days=Number(service?.days_remaining);
    if(Number.isFinite(days)&&days<0)return'renew';
    if(['expired','past_due','overdue'].includes(status))return'renew';
    return'current';
  }
  function stateLabel(state){return state==='current'?'Vigente':state==='renew'?'Por renovar':'Historial'}
  function duePhrase(service){
    if(!service?.next_due_date)return'Sin fecha';
    const days=Number(service.days_remaining);
    if(!Number.isFinite(days))return fmtDate(service.next_due_date);
    if(days===0)return'Hoy';
    if(days===1)return'Mañana';
    if(days>1)return`En ${days} días`;
    if(days===-1)return'Venció ayer';
    return`Venció hace ${Math.abs(days)} días`;
  }
  function productQuery(service){return encodeURIComponent(service.product_name||service.service_name||'')}
  function renderService(service,compact=false){
    const state=serviceState(service);
    const dueText=service.next_due_date?fmtDate(service.next_due_date):'Sin fecha';
    const actionLabel=state==='renew'?'Renovar':state==='history'?'Comprar de nuevo':'Renovar';
    const canTotp=Boolean(service.has_totp)&&state!=='history';
    return `<article class="portal-service-card state-${esc(state)}${compact?' compact':''}" data-assignment="${esc(service.assignment_id)}">
      <div class="portal-service-head"><div><h3>${esc(service.product_name||service.service_name)}</h3><small>${esc(service.plan_name||service.service_name||'Servicio')}</small></div><span class="portal-status ${esc(state)}">${esc(stateLabel(state))}</span></div>
      <div class="portal-service-meta"><div><span>Vencimiento</span><b>${esc(dueText)}</b></div><div><span>Estado</span><b>${esc(duePhrase(service))}</b></div></div>
      <div class="portal-service-actions">
        <a class="renew" href="shop.html?q=${productQuery(service)}"><i class="fa-solid fa-rotate"></i>${actionLabel}</a>
        ${canTotp?`<button class="totp" data-totp="${esc(service.assignment_id)}" data-service="${esc(service.product_name||service.service_name||'Servicio')}"><i class="fa-solid fa-key"></i>Generar código</button>`:''}
        <a data-web-support="1" href="https://wa.me/51991564053?text=${encodeURIComponent('Hola, necesito ayuda con mi servicio '+(service.product_name||service.service_name||'')+'.')}" target="_blank" rel="noopener"><i class="fa-solid fa-headset"></i>Ayuda</a>
      </div>
    </article>`;
  }
  function emptyBlock(title,text,icon='fa-box-open'){
    return `<div class="portal-empty-feature compact-empty"><i class="fa-solid ${icon}"></i><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  }
  function serviceGroup(title,subtitle,state,services,open=true){
    const body=services.length?`<div class="portal-service-grid">${services.map(s=>renderService(s)).join('')}</div>`:emptyBlock('Sin servicios en esta sección','Cuando haya movimientos, aparecerán aquí.','fa-circle-check');
    return `<section class="portal-service-group state-${state}"><details ${open?'open':''}><summary><div><span class="portal-group-dot"></span><div><b>${esc(title)}</b><small>${esc(subtitle)}</small></div></div><strong>${services.length}</strong></summary><div class="portal-service-group-body">${body}</div></details></section>`;
  }
  function renderDashboard(data){
    const customer=data.customer||{};
    const services=Array.isArray(data.services)?data.services:[];
    const current=services.filter(s=>serviceState(s)==='current').sort((a,b)=>String(a.next_due_date||'9999').localeCompare(String(b.next_due_date||'9999')));
    const renew=services.filter(s=>serviceState(s)==='renew').sort((a,b)=>String(b.next_due_date||'').localeCompare(String(a.next_due_date||'')));
    const history=services.filter(s=>serviceState(s)==='history').sort((a,b)=>String(b.next_due_date||'').localeCompare(String(a.next_due_date||'')));
    const next=current.find(s=>s.next_due_date)||null;

    $('welcomeName').textContent=`Hola, ${String(customer.name||'cliente').split(' ')[0]} 👋`;
    $('customerSince').textContent=customer.customer_since?`Cliente desde ${fmtDate(customer.customer_since)}`:'Tu espacio Innov IA';
    $('currentCount').textContent=current.length;
    $('renewCount').textContent=renew.length;
    $('nextDue').textContent=next?fmtDate(next.next_due_date):'—';

    $('homeServices').innerHTML=current.length?current.slice(0,3).map(s=>renderService(s,true)).join(''):emptyBlock('No tienes servicios vigentes','Puedes renovar uno anterior o comprar un nuevo servicio.','fa-bag-shopping');
    $('serviceGroups').innerHTML=[
      serviceGroup('Vigentes','Servicios dentro de su periodo actual','current',current,true),
      serviceGroup('Por renovar','Servicios con fecha de vencimiento pasada','renew',renew,true),
      serviceGroup('Historial','Cancelados o finalizados','history',history,false)
    ].join('');

    if(next){
      const days=Number(next.days_remaining);
      $('nextActionTitle').textContent=Number.isFinite(days)&&days<=7?`${next.product_name||next.service_name} vence pronto`:'Tu próximo vencimiento';
      $('nextActionText').textContent=`${next.product_name||next.service_name} · ${fmtDate(next.next_due_date)} · ${duePhrase(next)}`;
    }else if(renew.length){
      $('nextActionTitle').textContent='Tienes servicios por renovar';
      $('nextActionText').textContent=`${renew.length} ${renew.length===1?'servicio necesita':'servicios necesitan'} tu revisión.`;
    }else{
      $('nextActionTitle').textContent='Tu cuenta está al día';
      $('nextActionText').textContent='Aquí aparecerán próximos vencimientos y acciones pendientes.';
    }

    const renewPreview=$('renewPreview');
    if(renew.length){
      renewPreview.hidden=false;
      $('renewPreviewTitle').textContent=`${renew.length} ${renew.length===1?'servicio necesita':'servicios necesitan'} renovación`;
      const mostRecent=renew[0];
      $('renewPreviewText').textContent=mostRecent?`${mostRecent.product_name||mostRecent.service_name} · ${duePhrase(mostRecent)}`:'Revisa tus servicios vencidos.';
    }else renewPreview.hidden=true;
    bindDynamic();
  }
  function bindDynamic(){
    document.querySelectorAll('[data-totp]').forEach(btn=>btn.addEventListener('click',()=>openTotp(btn.dataset.totp,btn.dataset.service)));
    document.querySelectorAll('[data-go-tab]').forEach(btn=>btn.onclick=()=>activateTab(btn.dataset.goTab));
  }
  function activateTab(name){
    document.querySelectorAll('.portal-tabs [data-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tab===name));
    document.querySelectorAll('.portal-tab-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===name));
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function showTotpStep(step){
    $('totpLoadingStep').hidden=step!=='loading';
    $('totpVerifyStep').hidden=step!=='verify';
    $('totpCodeStep').hidden=step!=='code';
  }
  async function openTotp(id,service){
    activeAssignmentId=id;
    $('totpServiceTitle').textContent=service||'Código temporal';
    $('totpAccessInput').value='';
    $('totpCode').textContent='••••••';
    msg($('totpMsg'),'');
    showTotpStep('loading');
    $('totpDialog').showModal();
    await tryIssueAndRedeem(true);
  }
  async function verifyTotp(){
    const btn=$('verifyTotpAccess');
    const access=String($('totpAccessInput').value||'').trim();
    if(!access){msg($('totpMsg'),'Ingresa tu código de acceso para continuar.','err');return}
    setBusy(btn,true,'Verificando');msg($('totpMsg'),'');
    try{
      const data=await rpc('portal_verify_totp_access',{p_session_token:sessionToken,p_assignment_id:activeAssignmentId,p_access_code:access});
      if(!data?.ok)throw new Error(data?.message||'No se pudo verificar.');
      showTotpStep('loading');
      await tryIssueAndRedeem(false);
    }catch(error){showTotpStep('verify');msg($('totpMsg'),error.message,'err')}
    finally{setBusy(btn,false)}
  }
  async function tryIssueAndRedeem(silentVerification){
    try{
      const issued=await rpc('portal_issue_totp_access',{p_session_token:sessionToken,p_assignment_id:activeAssignmentId});
      if(!issued?.ok){
        if(issued?.verification_required){showTotpStep('verify');if(!silentVerification)msg($('totpMsg'),issued.message||'Verifica tu acceso.','err');return}
        throw new Error(issued?.message||'No se pudo generar el acceso TOTP.');
      }
      await syncSecureClock();
      const data=await redeemThroughEdge(issued.access_code);
      if(!data?.ok)throw new Error(data?.message||'No se pudo generar el código temporal.');
      await showOtp(data,issued.account_label);
    }catch(error){
      if(/verifica/i.test(error.message||'')){showTotpStep('verify')}
      else showTotpStep('verify');
      msg($('totpMsg'),error.message,'err');
    }
  }
  async function redeemThroughEdge(accessCode){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(`${SUPABASE_URL}/functions/v1/redeem-totp`,{
        method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'x-client-info':'innov-portal/2.0'},
        body:JSON.stringify({access_code:accessCode}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok&&!data?.message)throw new Error('Respuesta segura no válida.');
      return data;
    }catch(error){
      if(controller.signal.aborted)throw new Error('La validación segura tardó demasiado. Intenta nuevamente.');
      throw error;
    }finally{clearTimeout(timeout)}
  }
  function parseServerEpoch(data){
    const row=Array.isArray(data)?data[0]:data;
    const epoch=Number(row?.epoch_ms);
    if(!Number.isFinite(epoch)||epoch<=0)throw new Error('No se pudo sincronizar la hora segura.');
    return epoch;
  }
  async function takeClockSample(){
    const localEndStart=Date.now();
    const perfStart=performance.now();
    const data=await rpc('innov_totp_server_time',{});
    const perfEnd=performance.now();
    const localEnd=Date.now();
    const epoch=parseServerEpoch(data);
    const rtt=Math.max(0,perfEnd-perfStart);
    return {rtt,serverAtReceipt:epoch+(rtt/2),offset:(epoch+(rtt/2))-localEnd,localEndStart};
  }
  async function syncSecureClock(force=false){
    if(secureClock.ready&&!force&&Date.now()-secureClock.syncedAt<60000)return secureClock;
    if(secureClock.syncing)return secureClock.syncing;
    secureClock.syncing=(async()=>{
      const samples=[];
      for(let i=0;i<3;i++){try{samples.push(await takeClockSample())}catch(error){if(i===2&&!samples.length)throw error}}
      samples.sort((a,b)=>a.rtt-b.rtt);
      const best=samples[0];
      secureClock={...secureClock,ready:true,anchorServerMs:best.serverAtReceipt,anchorPerfMs:performance.now(),syncedAt:Date.now(),syncing:secureClock.syncing};
      return secureClock;
    })().finally(()=>{secureClock.syncing=null});
    return secureClock.syncing;
  }
  function secureNowMs(){return secureClock.ready?secureClock.anchorServerMs+(performance.now()-secureClock.anchorPerfMs):Date.now()}
  async function showOtp(data,label){
    const period=Math.max(15,Math.min(120,Number(data.otp?.period)||30));
    const digits=Number(data.otp?.digits)===8?8:6;
    const code=String(data.otp?.code||'');
    const reveal=Number(data.otp?.reveal_at_ms);
    const expires=Number(data.otp?.expires_at_ms);
    if(!new RegExp(`^\\d{${digits}}$`).test(code)||!Number.isFinite(reveal)||!Number.isFinite(expires)||expires<=reveal)throw new Error('El servidor no devolvió un TOTP válido.');
    $('totpAccountLabel').textContent=label||data.account?.label||'Cuenta TOTP';
    showTotpStep('code');
    msg($('totpMsg'),'');
    if(totpTimer)clearInterval(totpTimer);
    const total=Math.max(1000,expires-reveal);
    const tick=()=>{
      const now=secureNowMs();
      if(now<reveal){
        $('totpCode').textContent='••••••';
        $('totpTimerFill').style.width='100%';
        $('totpTimerText').textContent=`Disponible en ${Math.max(1,Math.ceil((reveal-now)/1000))} s`;
        return;
      }
      const left=Math.max(0,expires-now);
      $('totpCode').textContent=left>0?code:'••••••';
      $('totpTimerFill').style.width=`${Math.max(0,Math.min(100,left/total*100))}%`;
      $('totpTimerText').textContent=left>0?`Tiempo restante: ${Math.ceil(left/1000)} s`:'Código vencido';
      if(left<=0){clearInterval(totpTimer);totpTimer=null}
    };
    tick();totpTimer=setInterval(tick,250);
  }

  async function saveProfile(event){
    event.preventDefault();
    const btn=event.submitter;
    const day=Number($('birthdayDay').value||0);
    const month=Number($('birthdayMonth').value||0);
    if(!day||!month){msg($('profileMsg'),'Completa tu día y mes de cumpleaños para continuar.','err');return}
    setBusy(btn,true,'Guardando');
    try{
      const interests=[...document.querySelectorAll('.portal-interests input:checked')].map(input=>input.value);
      const data=await rpc('portal_update_profile',{p_session_token:sessionToken,p_name:$('profileName').value,p_email:$('profileEmail').value||null,p_birthday_day:day,p_birthday_month:month,p_interests:interests});
      if(!data?.ok)throw new Error(data?.message||'No se pudo guardar.');
      await bootDashboard();
    }catch(error){msg($('profileMsg'),error.message,'err')}finally{setBusy(btn,false)}
  }
  async function bootDashboard(){const data=await loadHome();renderDashboard(data);showView('dashboard')}
  async function submitLogin(event){
    event.preventDefault();
    const btn=event.submitter;
    setBusy(btn,true,'Buscando tu cuenta');msg($('loginMsg'),'');
    try{
      const data=await login($('identifier').value);
      if(!data?.ok)throw new Error(data?.message||'No encontramos tu cuenta.');
      sessionToken=data.session_token;localStorage.setItem(SESSION_KEY,sessionToken);
      const current=await loadHome();
      if(current.customer?.profile_complete){renderDashboard(current);showView('dashboard')}
      else{fillProfile(current.customer);showView('profile')}
    }catch(error){msg($('loginMsg'),error.message,'err')}finally{setBusy(btn,false)}
  }
  async function logout(callServer=true){
    const old=sessionToken;sessionToken='';home=null;
    localStorage.removeItem(SESSION_KEY);localStorage.removeItem(SNAPSHOT_KEY);
    if(callServer&&old){try{await rpc('portal_logout',{p_session_token:old})}catch{}}
    showView('login');
  }
  async function resume(){
    if(!sessionToken){showView('login');return}
    try{const current=await loadHome();if(current.customer?.profile_complete){renderDashboard(current);showView('dashboard')}else{fillProfile(current.customer);showView('profile')}}catch{logout(false)}
  }
  function initDays(){for(let day=1;day<=31;day++)$('birthdayDay').insertAdjacentHTML('beforeend',`<option value="${day}">${day}</option>`)}
  function bind(){
    $('loginForm').addEventListener('submit',submitLogin);
    $('profileForm').addEventListener('submit',saveProfile);
    $('portalLogout').addEventListener('click',()=>logout(true));
    $('nextActionBtn').addEventListener('click',()=>activateTab('services'));
    document.querySelectorAll('.portal-tabs [data-tab]').forEach(btn=>btn.addEventListener('click',()=>activateTab(btn.dataset.tab)));
    document.querySelectorAll('[data-close-dialog]').forEach(btn=>btn.addEventListener('click',()=>$(btn.dataset.closeDialog).close()));
    $('verifyTotpAccess').addEventListener('click',verifyTotp);
    $('copyTotp').addEventListener('click',async()=>{const code=$('totpCode').textContent.replace(/\D/g,'');if(code&&code.length>=6)await navigator.clipboard.writeText(code)});
    $('totpDialog').addEventListener('close',()=>{if(totpTimer)clearInterval(totpTimer);totpTimer=null});
    $('portalTheme').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('innov_theme',next)});
  }
  document.addEventListener('DOMContentLoaded',()=>{initDays();bind();resume()});
})();
