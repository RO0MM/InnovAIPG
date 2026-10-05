(()=>{
  'use strict';
  const URL='https://rfjvskrimsoqlyofhidj.supabase.co';
  const KEY='sb_publishable_P1cgsqPGMWHHWIujJayyqg_9hgJEXZh';
  const SESSION_KEY='innov_portal_session';
  const SNAPSHOT_KEY='innov_portal_snapshot';
  const token=localStorage.getItem(SESSION_KEY)||'';
  if(!token){document.documentElement.classList.add('portal-guest');return}

  const safeFirstName=name=>String(name||'').trim().split(/\s+/)[0].slice(0,24)||'Cliente';
  const localPhone=phone=>{const digits=String(phone||'').replace(/\D/g,'');return digits.length===11&&digits.startsWith('51')?digits.slice(2):digits};

  function paint(data){
    if(!data?.ok)return;
    const customer=data.customer||{};
    const complete=Boolean(data.profile_complete);
    document.documentElement.classList.toggle('portal-session-active',true);
    document.documentElement.classList.toggle('portal-profile-pending',!complete);
    document.querySelectorAll('[data-portal-account]').forEach(link=>{
      link.classList.add('portal-account-link');
      link.classList.toggle('portal-account-pending',!complete);
      link.setAttribute('href','mi-cuenta.html');
      link.setAttribute('title',complete?`Cuenta activa · ${customer.name||'Cliente'}`:'Completa tu perfil para continuar');
      link.replaceChildren();
      const icon=document.createElement('i');icon.className='fa-solid '+(complete?'fa-circle-user':'fa-user-pen');
      const text=document.createElement('span');text.textContent=complete?`Hola, ${safeFirstName(customer.name)}`:'Completar perfil';
      const dot=document.createElement('em');dot.className='portal-account-dot';dot.setAttribute('aria-hidden','true');
      link.append(icon,text,dot);
    });
    const snapshot={checked_at:Date.now(),profile_complete:complete,customer};
    localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(snapshot));
    autofill(customer);
    window.dispatchEvent(new CustomEvent('innov:portal-session',{detail:snapshot}));
  }

  function autofill(customer){
    const setIfEmpty=(id,value)=>{const el=document.getElementById(id);if(el&&!String(el.value||'').trim()&&value)el.value=value};
    const page=document.body?.dataset?.innovPage||'';
    if(page==='checkout'){
      setIfEmpty('fullName',customer.name);
      setIfEmpty('phone',localPhone(customer.phone));
    }
    if(page==='contact'){
      setIfEmpty('name',customer.name);
      setIfEmpty('email',customer.email);
    }
  }

  async function fetchSummary(){
    try{
      const response=await fetch(`${URL}/rest/v1/rpc/portal_get_session_summary`,{
        method:'POST',
        headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`,'Cache-Control':'no-store'},
        body:JSON.stringify({p_session_token:token}),
        cache:'no-store',credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok){
        if(data?.expired||response.status===401||response.status===403){localStorage.removeItem(SESSION_KEY);localStorage.removeItem(SNAPSHOT_KEY)}
        return;
      }
      paint(data);
    }catch{}
  }

  try{
    const cached=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');
    if(cached&&Date.now()-Number(cached.checked_at||0)<300000)paint({ok:true,...cached});
  }catch{}
  fetchSummary();
})();
