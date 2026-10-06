(()=>{
  'use strict';
  const ALERT='assets/audio/codigo-alerta.mp3';
  const GOODBYE='assets/audio/codigo-adios.mp3';
  const alertAudio=new Audio(ALERT);
  const byeAudio=new Audio(GOODBYE);
  alertAudio.preload='auto';
  byeAudio.preload='auto';

  let enabled=true;
  let unlocked=false;
  let copied=false;
  let cycleActive=false;
  let startedAlert=false;
  let manualClose=false;
  let byePlayed=false;
  let lastSecond=null;
  const marks=new Set();

  const $=id=>document.getElementById(id);

  function stop(audio){
    try{audio.pause();audio.currentTime=0}catch(_){ }
  }
  function play(audio){
    if(!enabled)return;
    try{stop(audio);audio.volume=1;audio.play().catch(()=>{})}catch(_){ }
  }
  function unlock(){
    if(unlocked)return;
    unlocked=true;
    [alertAudio,byeAudio].forEach(audio=>{
      try{
        audio.volume=.001;
        const p=audio.play();
        if(p?.then)p.then(()=>{audio.pause();audio.currentTime=0;audio.volume=1}).catch(()=>{audio.volume=1});
      }catch(_){audio.volume=1}
    });
  }
  function resetCycle(){
    enabled=true;
    const soundButton=$('soundToggle');
    if(soundButton){soundButton.setAttribute('aria-pressed','true');soundButton.textContent='🔊 Sonido activado';}
    copied=false;
    cycleActive=false;
    startedAlert=false;
    manualClose=false;
    byePlayed=false;
    lastSecond=null;
    marks.clear();
  }
  function ensureSoundButton(){
    const panel=document.querySelector('#screenCode .codePanel');
    const hide=$('hideBtn');
    if(!panel||!hide||$('soundToggle'))return;
    const button=document.createElement('button');
    button.type='button';
    button.id='soundToggle';
    button.className='secondaryBtn';
    button.setAttribute('aria-pressed','true');
    button.textContent='🔊 Sonido activado';
    hide.insertAdjacentElement('afterend',button);
    button.addEventListener('click',()=>{
      enabled=!enabled;
      button.setAttribute('aria-pressed',String(enabled));
      button.textContent=enabled?'🔊 Sonido activado':'🔇 Sonido silenciado';
      if(!enabled){stop(alertAudio);stop(byeAudio)}
      else unlock();
    });
  }
  function screenIsActive(id){return !!$(id)?.classList.contains('active')}
  function numericCodeVisible(){return /^\d{6,8}$/.test(String($('otpCode')?.textContent||'').trim())}
  function currentSecond(){
    const m=String($('timerText')?.textContent||'').match(/(\d+)\s*s/i);
    return m?Number(m[1]):null;
  }
  function evaluate(){
    const codeActive=screenIsActive('screenCode')&&numericCodeVisible();
    if(codeActive){
      if(!cycleActive){
        cycleActive=true;
        copied=false;
        manualClose=false;
        byePlayed=false;
        startedAlert=false;
        lastSecond=null;
        marks.clear();
      }
      const sec=currentSecond();
      if(!startedAlert){startedAlert=true;play(alertAudio)}
      if(Number.isFinite(sec)&&sec!==lastSecond){
        lastSecond=sec;
        if([25,20,15,10,5].includes(sec)&&!marks.has(sec)){
          marks.add(sec);
          if(!copied)play(alertAudio);
        }
      }
    }
    if(screenIsActive('screenThanks')&&cycleActive){
      if(!manualClose&&!byePlayed){byePlayed=true;play(byeAudio)}
      cycleActive=false;
    }
    if(screenIsActive('screenForm')&&!cycleActive){
      copied=false;manualClose=false;startedAlert=false;lastSecond=null;marks.clear();
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    ensureSoundButton();
    $('accessForm')?.addEventListener('submit',()=>{unlock();resetCycle()},{capture:true});
    $('otpCode')?.addEventListener('click',()=>{copied=true;stop(alertAudio)},{capture:true});
    $('copyBtn')?.addEventListener('click',()=>{copied=true;stop(alertAudio)},{capture:true});
    $('hideBtn')?.addEventListener('click',()=>{manualClose=true;stop(alertAudio)},{capture:true});

    const observer=new MutationObserver(evaluate);
    ['screenForm','screenWaiting','screenCode','screenThanks','timerText','otpCode'].forEach(id=>{
      const el=$(id); if(el)observer.observe(el,{attributes:true,childList:true,subtree:true,characterData:true});
    });
    evaluate();
  });
})();
