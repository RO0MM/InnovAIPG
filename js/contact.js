/* module: inline */
(function(){
  const f=document.getElementById('contactForm');
  if(!f)return;
  function waBase(){const s=window.INNOV_SOCIAL_CONFIG||{};let v=String(s.support_whatsapp_url||s.whatsapp_url||'51991564053').trim();if(/^\+?\d{7,15}$/.test(v))return 'https://wa.me/'+v.replace(/\D/g,'');if(!/^https?:\/\//i.test(v))v='https://'+v.replace(/^\/+/, '');return v;}
  f.addEventListener('submit',function(e){e.preventDefault();const name=document.getElementById('name').value.trim(),subject=document.getElementById('subject').value.trim(),message=document.getElementById('message').value.trim(),email=document.getElementById('email').value.trim();if(!name||!subject||!message){alert('Completa nombre, asunto y mensaje.');return;}const text=`Hola, soy ${name}.\nAsunto: ${subject}\n${message}${email?`\nCorreo: ${email}`:''}`;let href=waBase();try{const u=new URL(href);u.searchParams.set('text',text);href=u.href}catch(_){href+='?text='+encodeURIComponent(text)}window.open(href,'_blank','noopener');});
})();
