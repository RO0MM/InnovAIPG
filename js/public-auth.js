/* Innov Tienda · public auth compatibility bridge */
(function(){
  'use strict';
  window.INNOV_PUBLIC_AUTH_LOADED = true;
  function cartCount(){
    try{
      const raw = sessionStorage.getItem('innov_cart_v1') || localStorage.getItem('innov_cart_v1') || '[]';
      const rows = JSON.parse(raw);
      return Array.isArray(rows) ? rows.reduce((n,x)=>n+Math.max(0,Number(x&&x.qty||0)),0) : 0;
    }catch(_){ return 0; }
  }
  function syncCart(){
    const n=cartCount();
    document.querySelectorAll('[data-innov-cart-count]').forEach(el=>el.textContent=String(n));
  }
  document.addEventListener('DOMContentLoaded',syncCart,{once:true});
  window.addEventListener('storage',syncCart);
  window.INNOV_SYNC_CART_COUNT=syncCart;
})();
