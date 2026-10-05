/* module: inline */
(() => {
  if(window.top!==window.self){
    document.body.textContent='';
    return;
  }
  const SUPABASE_URL='https://rfjvskrimsoqlyofhidj.supabase.co';
  const SUPABASE_KEY='sb_publishable_P1cgsqPGMWHHWIujJayyqg_9hgJEXZh';
  const $=id=>document.getElementById(id);
  const USE_BUTTON_LABEL='✨ Solicitar código de acceso';

  if(!window.supabase?.createClient){
    $('useCodeBtn').disabled=true;
    $('clientMsg').className='msg show err';
    const icon=document.createElement('span');
    const text=document.createElement('span');
    icon.textContent='⚠️';
    text.textContent='No se pudo cargar la conexión segura. Recarga la página o revisa tu conexión.';
    $('clientMsg').replaceChildren(icon,text);
    return;
  }

  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  let activeAccount=null, activeAccess=null, activeOtpCode='', activeOtpCounter=null, activeOtpRevealAtMs=0, activeOtpExpiresAtMs=0;
  let timerId=null, waitingId=null, thanksTimeout=null, thanksProgressId=null, copyResetId=null;
  let isRedeeming=false;

  /*
   * El TOTP ya no usa la hora del PC/celular.
   * Se crea un reloj monotónico sincronizado con Supabase y se avanza con
   * performance.now(), evitando zonas horarias, cambios manuales y relojes atrasados.
   */
  const secureClock={
    ready:false,
    anchorServerMs:0,
    anchorPerfMs:0,
    offsetMs:0,
    rttMs:0,
    syncedAt:0,
    syncing:null
  };

  function normalizeCode(v){return String(v||'').trim().toUpperCase()}
  function safePeriod(v){const n=Number(v);return n===60?60:30}
  function otpWindowState(nowMs,revealAtMs,expiresAtMs){
    if(!Number.isFinite(nowMs)||!Number.isFinite(revealAtMs)||!Number.isFinite(expiresAtMs)||expiresAtMs<=revealAtMs)return'invalid';
    if(nowMs<revealAtMs)return'waiting';
    if(nowMs>=expiresAtMs)return'expired';
    return'active';
  }
  function showScreen(id){
    ['screenForm','screenWaiting','screenCode','screenThanks'].forEach(s=>{
      const el=$(s), active=s===id;
      el.classList.toggle('active',active);
      el.setAttribute('aria-hidden',active?'false':'true');
    });
  }
  function showMsg(text,type='info'){
    const box=$('clientMsg');
    const icon=document.createElement('span');
    const message=document.createElement('span');
    icon.textContent=type==='ok'?'✅':type==='err'?'⚠️':'ℹ️';
    message.textContent=String(text||'');
    box.className='msg show '+type;
    box.replaceChildren(icon,message);
  }
  function hideMsg(){$('clientMsg').className='msg';$('clientMsg').textContent=''}
  function setRedeeming(busy){
    isRedeeming=!!busy;
    $('useCodeBtn').disabled=!!busy;
    $('useCodeBtn').setAttribute('aria-busy',busy?'true':'false');
    $('useCodeBtn').textContent=busy?'⏳ Validando acceso…':USE_BUTTON_LABEL;
  }
  function clearAllTimers(){
    if(timerId)clearTimeout(timerId);
    if(waitingId)clearTimeout(waitingId);
    if(thanksTimeout)clearTimeout(thanksTimeout);
    if(thanksProgressId)cancelAnimationFrame(thanksProgressId);
    if(copyResetId)clearTimeout(copyResetId);
    timerId=waitingId=thanksTimeout=thanksProgressId=copyResetId=null;
    $('copyBtn').textContent='Copiar código';
    setRedeeming(false);
  }
  function returnToFormWithError(message,error){
    clearAllTimers();
    activeAccount=null;
    activeAccess=null;
    activeOtpCode='';
    activeOtpCounter=null;
    activeOtpRevealAtMs=0;
    activeOtpExpiresAtMs=0;
    showScreen('screenForm');
    showMsg(message,'err');
    if(error)console.error(error);
  }

  function setClockStatus(text,mode='ok'){
    ['clockStatus','waitingClockStatus'].forEach(id=>{
      const el=$(id);
      if(!el)return;
      el.className='clockStatus'+(mode==='syncing'?' syncing':mode==='warn'?' warn':'');
      el.textContent=text;
    });
  }

  function parseServerEpoch(data){
    const row=Array.isArray(data)?data[0]:data;
    const epoch=Number(row?.epoch_ms);
    if(!Number.isFinite(epoch)||epoch<=0)throw new Error('Respuesta de hora segura no válida.');
    return epoch;
  }

  async function rpcWithTimeout(name,args={},timeoutMs=10000){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      let request=db.rpc(name,args);
      if(typeof request.abortSignal==='function')request=request.abortSignal(controller.signal);
      return await request;
    }catch(error){
      if(controller.signal.aborted)throw new Error('La conexión segura tardó demasiado en responder.');
      throw error;
    }finally{
      clearTimeout(timeout);
    }
  }

  async function redeemThroughEdge(accessCode,timeoutMs=20000){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(SUPABASE_URL+'/functions/v1/redeem-totp',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'apikey':SUPABASE_KEY,
          'x-client-info':'innov-codigo/2.0'
        },
        body:JSON.stringify({access_code:accessCode}),
        cache:'no-store',
        credentials:'omit',
        referrerPolicy:'no-referrer',
        signal:controller.signal
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok&&!data?.message)throw new Error('Respuesta Edge no válida.');
      return data;
    }catch(error){
      if(controller.signal.aborted)throw new Error('La validación segura tardó demasiado en responder.');
      throw error;
    }finally{
      clearTimeout(timeout);
    }
  }

  async function takeClockSample(){
    const localStart=Date.now();
    const perfStart=performance.now();
    const {data,error}=await rpcWithTimeout('innov_totp_server_time',{},7000);
    const perfEnd=performance.now();
    const localEnd=Date.now();
    if(error)throw error;

    const epochAtServer=parseServerEpoch(data);
    const rttMs=Math.max(0,perfEnd-perfStart);
    const estimatedServerAtReceipt=epochAtServer+(rttMs/2);
    return {
      rttMs,
      serverAtReceiptMs:estimatedServerAtReceipt,
      offsetMs:estimatedServerAtReceipt-localEnd,
      localMidpointMs:(localStart+localEnd)/2
    };
  }

  async function syncSecureClock(force=false){
    const stillFresh=secureClock.ready&&(Date.now()-secureClock.syncedAt)<60000;
    if(stillFresh&&!force)return secureClock;
    if(secureClock.syncing)return secureClock.syncing;

    secureClock.syncing=(async()=>{
      setClockStatus('⏱ Sincronizando hora segura…','syncing');
      const samples=[];
      for(let i=0;i<3;i++){
        try{samples.push(await takeClockSample())}
        catch(error){if(i===2&&!samples.length)throw error}
      }
      if(!samples.length)throw new Error('No se pudo obtener la hora segura.');

      /* La muestra con menor latencia reduce el error de red, como en NTP. */
      samples.sort((a,b)=>a.rttMs-b.rttMs);
      const best=samples[0];
      secureClock.ready=true;
      secureClock.anchorServerMs=best.serverAtReceiptMs;
      secureClock.anchorPerfMs=performance.now();
      secureClock.offsetMs=best.offsetMs;
      secureClock.rttMs=best.rttMs;
      secureClock.syncedAt=Date.now();

      const driftSeconds=Math.round(Math.abs(best.offsetMs)/1000);
      if(driftSeconds>=2){
        setClockStatus(`✅ Hora segura activa · reloj corregido ${driftSeconds} s`,'ok');
      }else{
        setClockStatus('✅ Hora segura sincronizada con el servidor','ok');
      }
      return secureClock;
    })().finally(()=>{secureClock.syncing=null});

    return secureClock.syncing;
  }

  function secureNowMs(){
    if(!secureClock.ready)throw new Error('La hora segura todavía no está sincronizada.');
    return secureClock.anchorServerMs+(performance.now()-secureClock.anchorPerfMs);
  }

  async function redeemAccessCode(event){
    event?.preventDefault();
    if(isRedeeming)return;
    clearAllTimers();hideMsg();
    const accessCode=normalizeCode($('accessInput').value);
    if(!accessCode){showMsg('Ingresa tu código de acceso para continuar.','err');return}
    if(accessCode.length<6||accessCode.length>32||!/^[A-Z0-9-]+$/.test(accessCode)){
      showMsg('Revisa el código. Solo debe contener letras, números o guiones.','err');
      return;
    }
    setRedeeming(true);

    /* Sincronizar antes de consumir el acceso evita gastar un uso sin mostrar TOTP. */
    showMsg('Sincronizando hora segura...', 'info');
    try{
      await syncSecureClock(true);
    }catch(error){
      setRedeeming(false);
      showMsg('No se pudo sincronizar la hora segura. Revisa tu conexión e intenta nuevamente. No se usó la hora del dispositivo.','err');
      console.error('Clock sync:',error);
      return;
    }

    showMsg('Validando acceso...', 'info');
    let data;
    try{
      data=await redeemThroughEdge(accessCode);
    }catch(error){
      setRedeeming(false);
      showMsg('La validación tardó demasiado. Espera unos segundos antes de volver a intentarlo o contacta a soporte.','err');
      console.error('Redeem:',error);
      return;
    }
    if(!data?.ok){setRedeeming(false);showMsg(data?.message||'Código de acceso no válido.','err');return}
    const period=safePeriod(data.otp?.period);
    const digits=Number(data.otp?.digits)===8?8:6;
    const code=String(data.otp?.code||'');
    const revealAtMs=Number(data.otp?.reveal_at_ms);
    const expiresAtMs=Number(data.otp?.expires_at_ms);
    const periodMs=period*1000;
    if(!new RegExp('^\\d{'+digits+'}$').test(code)||!Number.isFinite(revealAtMs)||!Number.isFinite(expiresAtMs)||expiresAtMs<=revealAtMs||expiresAtMs-revealAtMs!==periodMs){
      setRedeeming(false);
      showMsg('La respuesta segura no fue válida. Contacta a soporte para no consumir otro uso.','err');
      return;
    }
    activeAccount={...(data.account||{}),period,digits};activeAccess=data.access;
    activeOtpCode=code;
    activeOtpRevealAtMs=revealAtMs;
    activeOtpExpiresAtMs=expiresAtMs;
    activeOtpCounter=Math.floor(revealAtMs/periodMs);
    $('accessInput').value='';
    setRedeeming(false);
    startWaitingForFreshCycle();
  }

  async function startWaitingForFreshCycle(){
    showScreen('screenWaiting');hideMsg();
    try{await syncSecureClock(false)}
    catch(error){returnToFormWithError('No se pudo mantener la sincronización segura. Intenta nuevamente.',error);return}

    const period=safePeriod(activeAccount?.period);
    const periodMs=period*1000;
    const revealAtMs=activeOtpRevealAtMs;
    if(!activeOtpCode||!Number.isFinite(revealAtMs)||!Number.isFinite(activeOtpExpiresAtMs)||activeOtpExpiresAtMs-revealAtMs!==periodMs){
      returnToFormWithError('La ventana segura del código no es válida. Contacta a soporte antes de usar otro acceso.');
      return;
    }

    const tick=async()=>{
      try{
        if(secureClock.syncing)await secureClock.syncing;
        const now=secureNowMs();
        const windowState=otpWindowState(now,revealAtMs,activeOtpExpiresAtMs);
        if(windowState==='expired'||windowState==='invalid'){
          waitingId=null;
          showThanksThenReset();
          return;
        }
        const waitMs=Math.max(0,revealAtMs-now);
        $('waitCounter').textContent=Math.max(0,Math.ceil(waitMs/1000))+' s';

        /* La ventana se fija al canjear: nunca salta a un ciclo posterior. */
        if(windowState==='active'){
          waitingId=null;
          await showTotp();
          return;
        }
        waitingId=setTimeout(tick,Math.min(250,Math.max(60,waitMs-80)));
      }catch(error){
        returnToFormWithError('La sincronización de hora se interrumpió. Contacta a soporte antes de consumir otro uso.',error);
      }
    };
    tick();
  }

  async function showTotp(){
    showScreen('screenCode');
    const currentUse=Math.max(1,Number(activeAccess?.used_count||1));
    const maxUses=Math.max(currentUse,Number(activeAccess?.max_uses||currentUse));
    $('accountLabel').textContent=(activeAccount?.label||'Cuenta')+' · Uso '+currentUse+' de '+maxUses;
    const period=safePeriod(activeAccount?.period);
    const periodMs=period*1000;
    if(secureClock.syncing)await secureClock.syncing;
    const firstNow=secureNowMs();
    if(activeOtpCounter===null||!activeOtpCode||otpWindowState(firstNow,activeOtpRevealAtMs,activeOtpExpiresAtMs)!=='active'){showThanksThenReset();return}
    $('otpCode').textContent=activeOtpCode;

    const refresh=async()=>{
      try{
        if(secureClock.syncing)await secureClock.syncing;
        const now=secureNowMs();
        const counter=Math.floor(now/periodMs);
        const remainingMs=activeOtpExpiresAtMs-now;

        /* Un canje autoriza un solo ciclo. Nunca se genera el TOTP siguiente. */
        if(counter!==activeOtpCounter||otpWindowState(now,activeOtpRevealAtMs,activeOtpExpiresAtMs)!=='active'||remainingMs<=180){
          timerId=null;
          showThanksThenReset();
          return;
        }

        const left=Math.max(0,Math.ceil(remainingMs/1000));
        const percent=Math.max(0,Math.min(100,(remainingMs/periodMs)*100));
        $('timerFill').style.width=percent+'%';
        $('timerText').textContent='Tiempo restante: '+left+' s';

        timerId=setTimeout(refresh,Math.min(250,Math.max(80,remainingMs-80)));
      }catch(e){
        returnToFormWithError('No se pudo generar el código. Contacta a soporte antes de consumir otro uso.',e);
      }
    };
    await refresh();
  }

  function runThanksProgress(duration=10000){
    const bar=$('thanksBar');
    if(!bar)return;
    if(thanksProgressId)cancelAnimationFrame(thanksProgressId);
    const started=performance.now();
    bar.style.width='100%';
    const step=now=>{
      const elapsed=now-started;
      const remaining=Math.max(0,1-elapsed/duration);
      bar.style.width=(remaining*100).toFixed(2)+'%';
      if(remaining>0)thanksProgressId=requestAnimationFrame(step);
      else{thanksProgressId=null;bar.style.width='0%'}
    };
    thanksProgressId=requestAnimationFrame(step);
  }

  function showThanksThenReset(){
    if($('screenThanks').classList.contains('active'))return;
    showScreen('screenThanks');
    activeAccount=null;
    activeAccess=null;
    activeOtpCode='';
    activeOtpCounter=null;
    activeOtpRevealAtMs=0;
    activeOtpExpiresAtMs=0;
    $('otpCode').textContent='------';
    setRedeeming(false);
    runThanksProgress(10000);
    thanksTimeout=setTimeout(()=>{$('accessInput').value='';showScreen('screenForm');showMsg('Proceso finalizado correctamente. Gracias por tu preferencia 💚','ok')},10000);
  }

  function hideCode(){clearAllTimers();showThanksThenReset()}

  async function copyOtp(){
    const code=$('otpCode').textContent.trim();
    if(!/^\d+$/.test(code))return;
    let copied=false;
    try{
      await navigator.clipboard.writeText(code);
      copied=true;
    }catch(error){
      try{
        const range=document.createRange();
        range.selectNodeContents($('otpCode'));
        const selection=window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        copied=document.execCommand('copy');
        selection.removeAllRanges();
      }catch(_){copied=false}
    }
    $('copyBtn').textContent=copied?'Copiado ✅':'Selecciona el número y cópialo';
    if(copyResetId)clearTimeout(copyResetId);
    copyResetId=setTimeout(()=>{$('copyBtn').textContent='Copiar código';copyResetId=null},1600);
  }

  $('accessForm').addEventListener('submit',redeemAccessCode);
  $('accessInput').addEventListener('input',event=>{
    const clean=normalizeCode(event.target.value).replace(/[^A-Z0-9-]/g,'').slice(0,32);
    if(event.target.value!==clean)event.target.value=clean;
    hideMsg();
  });
  $('clearBtn').addEventListener('click',()=>{$('accessInput').value='';$('accessInput').focus();hideMsg()});
  $('copyBtn').addEventListener('click',copyOtp);
  $('otpCode').addEventListener('click',copyOtp);
  $('hideBtn').addEventListener('click',hideCode);

  /* Al volver a la pestaña se corrige cualquier deriva acumulada. */
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&activeAccount){
      syncSecureClock(true).then(()=>{
        if(otpWindowState(secureNowMs(),activeOtpRevealAtMs,activeOtpExpiresAtMs)==='expired')showThanksThenReset();
      }).catch(error=>returnToFormWithError('No se pudo verificar la vigencia del código. Contacta a soporte antes de usar otro acceso.',error));
    }
  });
  window.addEventListener('online',()=>syncSecureClock(true).catch(()=>{}));
  window.addEventListener('pagehide',()=>{
    const hadActiveWindow=Boolean(activeOtpCode||activeAccount);
    clearAllTimers();
    activeAccount=null;
    activeAccess=null;
    activeOtpCode='';
    activeOtpCounter=null;
    activeOtpRevealAtMs=0;
    activeOtpExpiresAtMs=0;
    $('otpCode').textContent='------';
    if(hadActiveWindow){
      showScreen('screenForm');
      showMsg('La sesión temporal se cerró al salir de la página. Usa otro acceso si aún necesitas un código.','info');
    }
  });

  const params=new URLSearchParams(location.search);
  const initial=params.get('code');
  if(initial){
    $('accessInput').value=normalizeCode(initial).replace(/[^A-Z0-9-]/g,'').slice(0,32);
    params.delete('code');
    const cleanQuery=params.toString();
    history.replaceState(null,'',location.pathname+(cleanQuery?'?'+cleanQuery:'')+location.hash);
  }
})();
