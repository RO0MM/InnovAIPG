/* Innov AI Shop — conversion events, privacy-first.
   Disabled remote analytics by default. Enable GA4 only with a real G- ID
   AND consent from a real, informed user choice.
   Never send name, phone, email, order code, access credentials, or session data. */
(function(){
  'use strict';
  const ID = String(window.INNOV_GA4_ID || '').trim().toUpperCase();
  const validId = /^G-[A-Z0-9]{6,20}$/.test(ID);
  let consent = false;
  try {consent = localStorage.getItem('innov_analytics_consent') === 'granted';}catch(_){}
  const allowed = new Set(['page_view','view_item','add_to_cart','begin_checkout','generate_lead','payment_info_submitted','click_support']);
  const sanitize = (event, raw) => {
    const data = raw && typeof raw === 'object' ? raw : {};
    const result = {};
    const keys = ['currency','value','item_id','item_name','item_category','lead_type','payment_type','items'];
    keys.forEach(k=>{
      if(!(k in data)) return;
      if(k==='value' && typeof data[k] === 'number' && Number.isFinite(data[k])) result[k]=Math.max(0,data[k]);
      else if(k==='items' && Array.isArray(data.items)) result.items=data.items.slice(0,20).map(item=>({
        item_id: String(item.item_id || '').slice(0,120),
        item_name: String(item.item_name || '').slice(0,120),
        price: Number(item.price) || 0,
        quantity: Math.min(50, Math.max(1,Number(item.quantity)||1))
      }));
      else if(k!=='value' && k!=='items' && typeof data[k]==='string') result[k]=data[k].slice(0,120);
    });
    return result;
  };
  let attached=false;
  function connect(){
    if(attached || !validId || !consent) return false;
    attached=true;
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
    window.gtag('js',new Date());
    window.gtag('config',ID,{send_page_view:true,anonymize_ip:true});
    const script=document.createElement('script');
    script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);
    script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';
    document.head.appendChild(script);
    return true;
  }
  window.InnovMetrics={
    track(event,raw){
      if(!allowed.has(event)) return false;
      const detail=sanitize(event,raw);
      // Browser-local event; no network, cookies or storage if GA4 is not enabled.
      document.dispatchEvent(new CustomEvent('innov:metric',{detail:{event,params:detail}}));
      connect();
      if(attached && typeof window.gtag==='function') window.gtag('event',event,detail);
      return true;
    },
    grantConsent(){
      consent=true;
      try {localStorage.setItem('innov_analytics_consent','granted');} catch(_){}
      connect();
    },
    revokeConsent(){
      consent=false;
      try {localStorage.setItem('innov_analytics_consent','denied');} catch(_){}
      // To fully revoke GA4, reload and clear analytics cookies through consent manager.
      if(typeof window.gtag==='function') window.gtag('consent','update',{analytics_storage:'denied'});
    },
    configured:validId
  };
  connect();
  document.addEventListener('click',function(event){
    const link=event.target.closest && event.target.closest('a[href*="wa.me/"],a[href*="api.whatsapp.com/"]');
    if(link) window.InnovMetrics.track('click_support',{});
  });
})();
