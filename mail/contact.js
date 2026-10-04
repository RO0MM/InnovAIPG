/* Innov Tienda contact fallback: sends the existing form through WhatsApp. */
(function(){
  'use strict';
  function val(id){const e=document.getElementById(id);return e?String(e.value||'').trim():'';}
  function checked(id){const e=document.getElementById(id);return !!(e&&e.checked);}
  document.addEventListener('DOMContentLoaded',function(){
    const form=document.getElementById('contactForm');
    if(!form)return;
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      if(!form.checkValidity()){form.reportValidity();return;}
      if(document.getElementById('consent')&&!checked('consent')){form.reportValidity();return;}
      const msg=[
        'Hola, contacto desde Innov Tienda.',
        'Nombre: '+val('name'),
        'Correo: '+val('email'),
        'Asunto: '+val('subject'),
        'Mensaje: '+val('message')
      ].join('\n');
      window.open('https://wa.me/51991564053?text='+encodeURIComponent(msg),'_blank','noopener');
    });
  });
})();
