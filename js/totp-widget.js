(()=>{
  'use strict';
  const ALERT='assets/audio/codigo-alerta.mp3';
  const GOODBYE='assets/audio/codigo-adios.mp3';
  let unlocked=false;
  const audAlert=new Audio(ALERT); const audBye=new Audio(GOODBYE);
  audAlert.preload='auto'; audBye.preload='auto';
  function unlockAudio(){
    if(unlocked)return;
    unlocked=true;
    [audAlert,audBye].forEach(a=>{try{a.volume=0.001;const p=a.play();if(p?.then)p.then(()=>{a.pause();a.currentTime=0;a.volume=1}).catch(()=>{a.volume=1});}catch(_){a.volume=1}});
  }
  function play(audio,enabled){if(!enabled)return;try{audio.pause();audio.currentTime=0;audio.volume=1;audio.play().catch(()=>{});}catch(_){}}
  async function syncClock(rpc){
    const samples=[];
    for(let i=0;i<3;i++){
      const start=performance.now(); const local=Date.now();
      try{
        const row=await rpc('innov_totp_server_time',{}); const end=performance.now();
        const data=Array.isArray(row)?row[0]:row; const epoch=Number(data?.epoch_ms);
        if(Number.isFinite(epoch))samples.push({rtt:end-start,offset:epoch+(end-start)/2-local});
      }catch(_){ }
    }
    samples.sort((a,b)=>a.rtt-b.rtt);
    const offset=samples[0]?.offset||0;
    return ()=>Date.now()+offset;
  }
  function ensure(){
    let root=document.getElementById('innovTotpWidget');
    if(root)return root;
    root=document.createElement('div'); root.id='innovTotpWidget'; root.className='itw-overlay';
    root.innerHTML=`<section class="itw-card" role="dialog" aria-modal="true" aria-labelledby="itwHeading"><div class="itw-top"><img class="itw-brand" src="assets/img/logo.png" alt="Innov IA"><div class="itw-title"><small>Acceso temporal</small><h2 id="itwHeading">Código de verificación</h2></div><button class="itw-close" type="button" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></div><div class="itw-main"><div class="itw-account"><i class="fa-solid fa-shield-halved"></i><span data-itw-account>Cuenta vinculada</span></div><div class="itw-wait" data-itw-wait hidden>Preparando acceso</div><div class="itw-code" data-itw-code>------</div><p class="itw-sub" data-itw-sub>Usa este código antes de que termine el contador.</p><div class="itw-progress"><span data-itw-fill></span></div><div class="itw-time"><span data-itw-time>-- s</span><span data-itw-clock>Hora segura</span></div><div class="itw-actions"><button class="itw-copy" type="button"><i class="fa-regular fa-copy"></i> <span>Copiar código</span></button><button class="itw-sound" type="button" aria-pressed="true"><i class="fa-solid fa-volume-high"></i><span>Sonido</span></button></div><div class="itw-status"><i class="fa-solid fa-circle-info"></i><div><strong>Un solo ciclo.</strong> El código desaparece al vencer y no mostraremos automáticamente el siguiente.</div></div></div></section>`;
    document.body.appendChild(root); return root;
  }
  function open(opts={}){
    const root=ensure(), card=root.querySelector('.itw-card');
    card.classList.toggle('light',document.documentElement.dataset.theme==='light');
    const codeEl=root.querySelector('[data-itw-code]'), waitEl=root.querySelector('[data-itw-wait]'), fill=root.querySelector('[data-itw-fill]'), timeEl=root.querySelector('[data-itw-time]'), account=root.querySelector('[data-itw-account]'), sub=root.querySelector('[data-itw-sub]'), copy=root.querySelector('.itw-copy'), sound=root.querySelector('.itw-sound');
    account.textContent=opts.accountLabel||'Cuenta vinculada';
    let enabled=true,copied=false,closed=false,timer=null,lastSecond=null,started=false,byePlayed=false; const marks=new Set();
    const now=typeof opts.now==='function'?opts.now:()=>Date.now();
    const reveal=Number(opts.revealAtMs||now()), expires=Number(opts.expiresAtMs||reveal+30000), code=String(opts.code||'');
    const period=Math.max(1,expires-reveal);
    root.classList.add('open'); document.body.style.overflow='hidden';
    function close(){closed=true;if(timer)clearTimeout(timer);root.classList.remove('open');document.body.style.overflow='';opts.onClose?.();}
    root.querySelector('.itw-close').onclick=close; root.onclick=e=>{if(e.target===root)close()};
    sound.onclick=()=>{enabled=!enabled;sound.setAttribute('aria-pressed',String(enabled));sound.querySelector('i').className=enabled?'fa-solid fa-volume-high':'fa-solid fa-volume-xmark';sound.querySelector('span').textContent=enabled?'Sonido':'Silencio';if(!enabled){audAlert.pause();audBye.pause();}};
    copy.classList.remove('copied');copy.querySelector('span').textContent='Copiar código';
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(code)}catch(_){const t=document.createElement('textarea');t.value=code;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}copied=true;copy.classList.add('copied');copy.querySelector('span').textContent='Código copiado';opts.onCopy?.();};
    function tick(){
      if(closed)return; const t=now();
      if(t<reveal){
        const left=Math.max(0,Math.ceil((reveal-t)/1000));waitEl.hidden=false;codeEl.hidden=true;copy.disabled=true;waitEl.textContent='Preparando acceso';sub.textContent='Sincronizando el inicio del ciclo seguro.';timeEl.textContent=`${left} s`;fill.style.width='0%';timer=setTimeout(tick,120);return;
      }
      waitEl.hidden=true; codeEl.hidden=false; copy.disabled=false;
      if(t>=expires){
        codeEl.textContent='Código vencido';root.classList.add('itw-expired');timeEl.textContent='0 s';fill.style.width='0%';sub.textContent='Solicita un nuevo acceso si todavía necesitas ingresar.';if(!byePlayed){byePlayed=true;play(audBye,enabled);opts.onExpire?.();}return;
      }
      root.classList.remove('itw-expired');codeEl.textContent=code;
      const remaining=Math.max(0,expires-t), sec=Math.ceil(remaining/1000); timeEl.textContent=`${sec} s`;fill.style.width=`${Math.max(0,Math.min(100,remaining/period*100))}%`;
      if(!started){started=true;play(audAlert,enabled)}
      if(sec!==lastSecond){lastSecond=sec;if([25,20,15,10,5].includes(sec)&&!marks.has(sec)){marks.add(sec);if(!copied)play(audAlert,enabled)}}
      timer=setTimeout(tick,120);
    }
    tick(); return {close};
  }
  function mount(target,opts={}){
    const host=typeof target==='string'?document.querySelector(target):target;
    if(!host)return null;
    try{host.__itwController?.close?.()}catch(_){}
    host.hidden=false;
    host.innerHTML=`<div class="pv4-inline-code"><div class="pv4-inline-code-main"><div class="pv4-inline-code-digits" data-itw-inline-code>------</div><button class="pv4-inline-code-copy" type="button" aria-label="Copiar código"><i class="fa-regular fa-copy"></i></button><button class="pv4-inline-code-sound" type="button" aria-label="Sonido" aria-pressed="true"><i class="fa-solid fa-volume-high"></i></button></div><div class="pv4-inline-code-progress"><span data-itw-inline-fill></span></div><div class="pv4-inline-code-foot"><span data-itw-inline-account>Cuenta vinculada</span><b data-itw-inline-time>-- s</b></div></div>`;
    const root=host.firstElementChild, codeEl=root.querySelector('[data-itw-inline-code]'), fill=root.querySelector('[data-itw-inline-fill]'), timeEl=root.querySelector('[data-itw-inline-time]'), account=root.querySelector('[data-itw-inline-account]'), copy=root.querySelector('.pv4-inline-code-copy'), sound=root.querySelector('.pv4-inline-code-sound');
    account.textContent=opts.accountLabel||'Cuenta vinculada';
    let enabled=true,copied=false,closed=false,timer=null,lastSecond=null,started=false,byePlayed=false;const marks=new Set();
    const now=typeof opts.now==='function'?opts.now:()=>Date.now();
    const reveal=Number(opts.revealAtMs||now()),expires=Number(opts.expiresAtMs||reveal+30000),code=String(opts.code||'');
    const period=Math.max(1,expires-reveal);
    function close(){closed=true;if(timer)clearTimeout(timer)}
    sound.onclick=()=>{enabled=!enabled;sound.setAttribute('aria-pressed',String(enabled));sound.querySelector('i').className=enabled?'fa-solid fa-volume-high':'fa-solid fa-volume-xmark';if(!enabled){audAlert.pause();audBye.pause();}};
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(code)}catch(_){const t=document.createElement('textarea');t.value=code;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}copied=true;copy.classList.add('copied');copy.innerHTML='<i class="fa-solid fa-check"></i>';opts.onCopy?.();};
    function tick(){
      if(closed)return;const t=now();
      if(t<reveal){const left=Math.max(0,Math.ceil((reveal-t)/1000));codeEl.textContent='Preparando…';timeEl.textContent=`${left} s`;fill.style.width='0%';copy.disabled=true;timer=setTimeout(tick,120);return;}
      copy.disabled=false;
      if(t>=expires){root.classList.add('expired');codeEl.textContent='Código vencido';timeEl.textContent='0 s';fill.style.width='0%';if(!byePlayed){byePlayed=true;play(audBye,enabled);opts.onExpire?.();}return;}
      root.classList.remove('expired');codeEl.textContent=code;
      const remaining=Math.max(0,expires-t),sec=Math.ceil(remaining/1000);timeEl.textContent=`${sec} s`;fill.style.width=`${Math.max(0,Math.min(100,remaining/period*100))}%`;
      if(!started){started=true;play(audAlert,enabled)}
      if(sec!==lastSecond){lastSecond=sec;if([25,20,15,10,5].includes(sec)&&!marks.has(sec)){marks.add(sec);if(!copied)play(audAlert,enabled)}}
      timer=setTimeout(tick,120);
    }
    const ctl={close};host.__itwController=ctl;tick();return ctl;
  }
  window.InnovTotpWidget={open,mount,unlockAudio,syncClock};
})();
