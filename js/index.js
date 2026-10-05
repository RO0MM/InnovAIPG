/* module: inline */
(function(){
    'use strict';
    const SUPABASE_URL='https://rfjvskrimsoqlyofhidj.supabase.co';
    const SUPABASE_KEY='sb_publishable_P1cgsqPGMWHHWIujJayyqg_9hgJEXZh';
    const SETTINGS_RPC='get_public_home_showcase';
    const SOCIAL_RPC='get_public_store_social';
    const CART_KEY='innov_cart_v1';
    const DEFAULT_SOCIAL={
      whatsapp_url:'https://wa.me/51991564053',support_whatsapp_url:'51991564053',
      support_message:'Hola, quisiera apoyo con un servicio.\nProducto o pedido: _____.\nConsulta: _____.\nGracias.',
      facebook_url:'https://www.facebook.com/profile.php?id=61585560703359',tiktok_url:'https://www.tiktok.com/@innoovia',instagram_url:'https://www.instagram.com/innov_iaa/'
    };
    const state={products:[],config:null,active:0,autoTimer:null,progressTimer:null,seconds:5,paused:false,manualPause:false,slideTimer:null,records:new WeakMap(),bound:false};
    const $=id=>document.getElementById(id);
    const text=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
    const esc=v=>String(v==null?'':v).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
    const arr=v=>{if(Array.isArray(v))return v;if(typeof v==='string'){try{const x=JSON.parse(v);return Array.isArray(x)?x:[];}catch(_){return v?[v]:[];}}return[];};
    const bool=(v,def=true)=>{if(v===false||v===0||String(v).toLowerCase()==='false')return false;if(v==null||v==='')return def;return true;};
    const json=v=>{if(v&&typeof v==='object')return v;try{return JSON.parse(v||'{}')}catch(_){return {}}};
    const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
    const url=v=>{const raw=text(v);if(!raw)return '';if(/^(https?:|data:|blob:)/i.test(raw))return raw;if(/^\.?\/?(img|assets)\//i.test(raw)||raw.startsWith('./')||raw.startsWith('../')||raw.startsWith('/'))return raw;if(/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(raw))return 'https://'+raw;return raw;};
    const category=c=>{const k=text(c).toLowerCase();return k==='ai'?'IA':k==='streaming'?'Streaming':k==='musica'?'Diseño y video':k==='otros'?'Herramientas':(k||'Servicio');};
    const categoryIcon=c=>{const k=text(c).toLowerCase();return k==='ai'?'fa-robot':k==='streaming'?'fa-tv':k==='musica'?'fa-wand-magic-sparkles':'fa-cubes'};
    const money=(n,c='PEN')=>{const value=Number(n);if(!Number.isFinite(value))return 'Consultar';return (String(c).toUpperCase()==='USD'?'US$':'S/')+' '+value.toLocaleString('es-PE',{minimumFractionDigits:value%1?2:0,maximumFractionDigits:2});};
    const genericArtwork=()=>`data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 520"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#123058"/><stop offset="1" stop-color="#071323"/></linearGradient></defs><rect width="760" height="520" fill="url(#g)"/><circle cx="626" cy="72" r="155" fill="#ffcb28" opacity=".14"/><circle cx="104" cy="454" r="205" fill="#fff" opacity=".055"/><rect x="240" y="172" width="280" height="170" rx="32" fill="#fff" opacity=".12"/><text x="380" y="255" text-anchor="middle" fill="#fff" font-family="Arial" font-size="40" font-weight="700">INNOV</text><text x="380" y="300" text-anchor="middle" fill="#ffcb28" font-family="Arial" font-size="40" font-weight="700">TIENDA</text></svg>')}`;

    function plans(product){return (product.plans||[]).filter(p=>p&&p.active!==false).sort((a,b)=>Number(a.priority||100)-Number(b.priority||100)||text(a.name).localeCompare(text(b.name),'es'));}
    function planAvailable(p){if(!p||p.active===false)return false;const s=text(p.availabilityStatus||'available').toLowerCase();if(['unavailable','out_of_stock','disabled','inactive'].includes(s))return false;if(p.allowWithoutStock)return true;const mode=text(p.stockMode||'controlled').toLowerCase(); if(mode==='unlimited')return true; if(mode==='manual'||mode==='preorder')return Number(p.stock||0)>0||s==='available'||s==='consult'; return Number(p.stock||0)>0;}
    function preferred(product){const list=plans(product);return list.find(planAvailable)||list[0]||null;}
    function available(product){return plans(product).some(planAvailable);}
    function priceInfo(product){const list=plans(product).filter(p=>Number.isFinite(Number(p.price)));const good=list.filter(planAvailable);const use=good.length?good:list;if(!use.length)return {plan:null,value:null,count:0};const plan=use.reduce((a,b)=>Number(a.price)<=Number(b.price)?a:b);return {plan,value:Number(plan.price),count:use.length};}
    function productImage(product){const p=preferred(product);return url((p&&p.image)||product.image||'');}
    function productWebsite(product){const p=preferred(product);return url((p&&p.websiteUrl)||product.websiteUrl||'');}
    function productMedia(product){
      const p=preferred(product);
      if(p&&p.videoEnabled!==false&&p.videoUrl)return {url:url(p.videoUrl),type:text(p.videoType||'auto'),fit:text(p.videoFit||product.videoFit||'cover')};
      if(product.videoEnabled!==false&&product.videoUrl)return {url:url(product.videoUrl),type:text(product.videoType||'auto'),fit:text(product.videoFit||'cover')};
      return {url:'',type:'auto',fit:text((p&&p.videoFit)||product.videoFit||'cover')};
    }
    function productVideo(product){return productMedia(product).url;}
    function productFit(product){return productMedia(product).fit.toLowerCase()==='contain'?'contain':'cover';}
    /* Convierte exactamente las filas de get_public_catalog al formato de la portada.
       Mantiene prioridad: video del plan -> video del producto; imagen del plan -> imagen del producto. */
    function buildCatalog(rows){
      const map=new Map();
      (rows||[]).forEach(row=>{
        if(!bool(row.product_active,true)) return;
        const mode=text(row.sale_mode||row.product_mode||row.mode||'retail').toLowerCase();
        if(mode.includes('whole')||mode.includes('prove')) return;
        const id=text(row.product_id||row.product_slug);
        if(!id) return;
        const slug=text(row.product_slug||id);
        if(!map.has(id)){
          map.set(id,{
            id, slug,
            name:text(row.product_name)||'Producto',
            description:text(row.product_description||row.product_desc||''),
            category:text(row.category)||'otros',
            priority:Number(row.product_priority||100),
            image:url(row.image_url||row.product_image_url||row.product_thumbnail_url||row.thumbnail_url||row.product_logo_url||row.logo_url||''),
            websiteUrl:url(row.website_url||''),
            videoUrl:url(row.product_video_url||row.video_url||''),
            videoType:text(row.product_video_type||row.video_type||'auto'),
            videoEnabled:bool(row.product_video_enabled,true),
            videoFit:text(row.product_video_fit||row.video_fit||'cover'),
            plans:[]
          });
        }
        const product=map.get(id);
        const planId=text(row.plan_id);
        if(!planId) return;
        product.plans.push({
          id:planId,
          name:text(row.plan_name)||'Plan',
          price:row.price==null?null:Number(row.price),
          currency:text(row.currency||'PEN'),
          period:text(row.period||''),
          priority:Number(row.plan_priority||100),
          active:bool(row.plan_active,true),
          stock:Number(row.available_stock||0),
          stockMode:text(row.stock_mode||'controlled'),
          availabilityStatus:text(row.availability_status||'available'),
          allowWithoutStock:bool(row.allow_purchase_without_stock,false),
          chips:arr(row.chips).map(text).filter(Boolean),
          benefits:arr(row.benefits).map(text).filter(Boolean),
          description:text(row.plan_description||row.product_description||''),
          image:url(row.plan_image_url||row.plan_thumbnail_url||row.plan_logo_url||row.image_url||row.product_image_url||row.product_thumbnail_url||row.thumbnail_url||row.product_logo_url||row.logo_url||''),
          websiteUrl:url(row.plan_website_url||row.website_url||''),
          videoUrl:url(row.plan_video_url||row.product_video_url||row.video_url||''),
          videoType:text(row.plan_video_type||row.product_video_type||row.video_type||'auto'),
          videoEnabled:bool(row.plan_video_enabled,true)&&bool(row.product_video_enabled,true),
          videoFit:text(row.plan_video_fit||row.product_video_fit||row.video_fit||'cover')
        });
      });
      return [...map.values()].sort((a,b)=>Number(a.priority||100)-Number(b.priority||100)||a.name.localeCompare(b.name,'es'));
    }

    function config(raw){const x=json(raw),ids=(value,max=null)=>{const out=[...new Set(arr(value).map(String).filter(Boolean))];return max==null?out:out.slice(0,max)};let promo=ids(x.promo_product_ids||x.promo_ids,3);if(!promo.length)promo=[x.promo_top_product_id||x.promo_top_id,x.promo_bottom_product_id||x.promo_bottom_id,x.promo_third_product_id||x.promo_third_id].map(text).filter(Boolean);const saved=Number(x.carousel_seconds||x.rotation_seconds||0);const seconds=(Number(x.version||0)>=6&&saved)?clamp(saved,3,10):5;return {hero:ids(x.hero_product_ids||x.hero_ids),promos:promo.slice(0,3),bottom:ids(x.bottom_product_ids||x.lower_product_ids),seconds};}
    const shopLink=p=>'shop.html#p=db-'+encodeURIComponent(p.slug||p.id);
    function selected(products,cfg){const byId=new Map(products.map(p=>[String(p.id),p]));const hero=(cfg.hero||[]).map(id=>byId.get(String(id))).filter(Boolean);const fallback=products.slice(0,5);return {hero:hero.length?hero:fallback.slice(0,Math.min(3,fallback.length)),promos:(cfg.promos||[]).map(id=>byId.get(String(id))).filter(Boolean),bottom:(cfg.bottom||[]).map(id=>byId.get(String(id))).filter(Boolean)};}

    function parseYouTube(v){const raw=url(v);try{const u=new URL(raw),host=u.hostname.replace(/^www\./,'').replace(/^m\./,'');let id='';if(host==='youtu.be')id=u.pathname.split('/').filter(Boolean)[0]||'';else if(host.includes('youtube.com')){const parts=u.pathname.split('/').filter(Boolean);id=u.searchParams.get('v')||((parts[0]==='shorts'||parts[0]==='embed')?parts[1]:'');}return id?{type:'youtube',id,list:u.searchParams.get('list')||''}:null;}catch(_){const m=raw.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);return m?{type:'youtube',id:m[1],list:''}:null;}}
    function parseDrive(v){const raw=url(v);try{const u=new URL(raw),host=u.hostname.replace(/^www\./,'');if(!host.includes('drive.google.com')&&!host.includes('drive.usercontent.google.com'))return null;const parts=u.pathname.split('/').filter(Boolean);const id=u.searchParams.get('id')||(parts.indexOf('d')>=0?parts[parts.indexOf('d')+1]:'');return id?{type:'drive',id,direct:`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,preview:`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`}:null;}catch(_){return null;}}
    function parseTikTok(v){const raw=url(v);try{const u=new URL(raw);if(!/tiktok\.com/i.test(u.hostname))return null;const p=u.pathname.split('/').filter(Boolean),i=p.indexOf('video');const id=i>=0?p[i+1]:'';return id?{type:'tiktok',id}:null;}catch(_){const m=raw.match(/(?:video\/|player\/v1\/|embed\/)(\d{8,})/i);return m?{type:'tiktok',id:m[1]}:null;}}
    function parseVimeo(v){const m=url(v).match(/vimeo\.com\/(?:video\/)?(\d+)/i);return m?{type:'vimeo',id:m[1]}:null;}
    function parseFacebook(v){const raw=url(v);return /(?:facebook\.com|fb\.watch)/i.test(raw)?{type:'facebook',url:raw}:null;}
    function mediaSource(v,hint){
      const raw=url(v),kind=text(hint||'auto').toLowerCase();
      if(!raw)return {type:'none'};
      /* Primero detectamos por enlace: evita tratar un youtu.be como si fuera un MP4
         cuando el admin dejó el tipo en “archivo” por error. */
      const platform=parseYouTube(raw)||parseDrive(raw)||parseTikTok(raw)||parseVimeo(raw)||parseFacebook(raw);
      if(platform)return platform;
      const forced=kind.replace(/[ _-]/g,'');
      if(['file','mp4','webm','video','upload','supabase','storage','direct'].includes(forced))return {type:'file',url:raw};
      if(['youtube','yt','drive','gdrive','googledrive','vimeo','tiktok','facebook','fb'].includes(forced))return {type:'unsupported',url:raw};
      if(/\.(mp4|webm|ogg|mov|m4v)(?:[?#]|$)/i.test(raw)||/\/storage\/v1\/object\/(?:public|sign)\//i.test(raw)||/supabase\.co\/storage\/v1\//i.test(raw))return {type:'file',url:raw};
      return {type:'unsupported',url:raw};
    }
    /* Reproductor de portada: usa la misma ruta de YouTube IFrame API que Shop.
       Así YouTube recibe el origen real del sitio y no el iframe manual que producía Error 153. */
    function ensureYT(){
      if(window.YT&&window.YT.Player)return Promise.resolve(window.YT);
      if(state.ytPromise)return state.ytPromise;
      state.ytPromise=new Promise((resolve,reject)=>{
        const previous=window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady=function(){
          try{if(typeof previous==='function')previous();}catch(_){}
          resolve(window.YT);
        };
        const existing=document.querySelector('script[data-innov-youtube-api]');
        if(existing){
          existing.addEventListener('error',()=>reject(new Error('No se pudo cargar YouTube')),{once:true});
        }else{
          const script=document.createElement('script');
          script.src='https://www.youtube.com/iframe_api';
          script.async=true;
          script.dataset.innovYoutubeApi='1';
          script.onerror=()=>reject(new Error('No se pudo cargar YouTube'));
          document.head.appendChild(script);
        }
        setTimeout(()=>{if(!(window.YT&&window.YT.Player))reject(new Error('Tiempo agotado de YouTube'));},9000);
      });
      return state.ytPromise;
    }
    function domainFrom(v){try{return new URL(url(v)).hostname.replace(/^www\./,'');}catch(_){return '';}}
    function posterFromMedia(meta){const source=mediaSource(meta.url,meta.type);if(source.type==='youtube')return `https://i.ytimg.com/vi/${encodeURIComponent(source.id)}/hqdefault.jpg`;return '';}
    function fallbackHtml(product){
      const meta=productMedia(product),domain=domainFrom(productWebsite(product));
      const primary=productImage(product)||posterFromMedia(meta)||(domain?`https://logo.clearbit.com/${encodeURIComponent(domain)}?size=512`:'')||genericArtwork();
      const backup=posterFromMedia(meta)||(domain?`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`:genericArtwork());
      return `<div class="hero-fallback"><img src="${esc(primary)}" data-fallback="${esc(backup)}" alt="${esc(product.name)}" referrerpolicy="strict-origin-when-cross-origin" onerror="if(!this.dataset.f){this.dataset.f='1';this.src=this.dataset.fallback||'${esc(genericArtwork())}';}else{this.onerror=null;this.src='${esc(genericArtwork())}';}"></div>`;
    }
    function mediaMarkup(product,kind){const meta=productMedia(product);if(!meta.url)return fallbackHtml(product);return `${fallbackHtml(product)}<div class="media-shell js-media" data-kind="${esc(kind)}" data-source="${esc(meta.url)}" data-type="${esc(meta.type)}" data-fit="${esc(productFit(product))}"></div>`;}
    function safePlay(video){try{const p=video&&video.play&&video.play();if(p&&typeof p.catch==='function')p.catch(()=>{});}catch(_){}}
    function safePause(video){try{if(video&&video.pause)video.pause();}catch(_){}}
    function safeYT(player,method){try{if(player&&typeof player[method]==='function')player[method]();}catch(_){}}
    function mountMedia(shell,active){
      if(!shell)return;
      shell.dataset.active=active?'1':'0';
      const existing=state.records.get(shell);
      if(existing){
        if(active){
          if(existing.video)safePlay(existing.video);
          if(existing.player){safeYT(existing.player,'mute');safeYT(existing.player,'playVideo');}
        }
        return;
      }
      const source=mediaSource(shell.dataset.source||'',shell.dataset.type||'auto');
      if(source.type==='none'||source.type==='unsupported'){shell.dataset.failed='1';return;}
      shell.dataset.mounted='1';
      shell.classList.add('is-loading');
      if(shell.dataset.fit==='contain')shell.classList.add('contain');
      const record={shell,source,type:source.type,video:null,frame:null,player:null};
      state.records.set(shell,record);
      const ready=()=>{shell.classList.remove('is-loading');shell.classList.add('ready');};
      const fail=()=>{shell.classList.remove('is-loading','ready','frame');shell.dataset.failed='1';};
      const mountFrame=(src,label,delay)=>{
        if(record.frame)return;
        shell.classList.add('frame');
        const f=document.createElement('iframe');
        f.src=src;
        f.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture; web-share');
        f.setAttribute('allowfullscreen','');
        f.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
        f.setAttribute('loading','eager');
        f.title='Vista previa de video';
        f.onload=()=>setTimeout(ready,delay||600);
        f.onerror=fail;
        shell.appendChild(f);record.frame=f;record.type=label;
      };
      if(source.type==='file'||source.type==='drive'){
        const v=document.createElement('video');
        v.muted=true;v.defaultMuted=true;v.loop=true;v.playsInline=true;v.autoplay=!!active;
        v.preload='auto';v.controls=false;
        v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.setAttribute('muted','');
        v.src=source.type==='drive'?source.direct:source.url;
        let settled=false;
        const reveal=()=>{if(settled)return;settled=true;ready();if(shell.dataset.active==='1')safePlay(v);};
        v.addEventListener('loadedmetadata',reveal,{once:true});
        v.addEventListener('loadeddata',reveal,{once:true});
        v.addEventListener('canplay',reveal,{once:true});
        v.addEventListener('playing',reveal,{once:true});
        v.addEventListener('error',()=>{
          if(source.type==='drive'&&!record.frame){safePause(v);v.remove();mountFrame(source.preview,'drive-preview',800);}else fail();
        },{once:true});
        shell.appendChild(v);record.video=v;
        if(active)setTimeout(()=>{if(!settled&&!shell.dataset.failed)reveal();},1400);
        if(source.type==='drive')setTimeout(()=>{if(!shell.classList.contains('ready')&&!record.frame){safePause(v);v.remove();mountFrame(source.preview,'drive-preview',850);}},4500);
        return;
      }
      if(source.type==='youtube'){
        ensureYT().then(YT=>{
          if(!document.body.contains(shell)||shell.dataset.failed==='1')return;
          const holder=document.createElement('div');
          holder.className='yt-holder';
          holder.id='innov_yt_'+Math.random().toString(36).slice(2);
          shell.appendChild(holder);
          const origin=(window.location.origin&&window.location.origin!=='null')?window.location.origin:undefined;
          const playerVars={
            autoplay:active?1:0,mute:1,controls:0,rel:0,loop:1,playlist:source.id,
            playsinline:1,fs:0,disablekb:1,iv_load_policy:3,cc_load_policy:0,
            modestbranding:1,origin:origin
          };
          let player;
          const fallbackTimer=setTimeout(()=>{
            if(!shell.classList.contains('ready')){try{holder.remove();}catch(_){}fail();}
          },9000);
          player=new YT.Player(holder.id,{
            videoId:source.id,
            host:'https://www.youtube-nocookie.com',
            playerVars,
            events:{
              onReady:function(event){
                clearTimeout(fallbackTimer);
                record.player=event.target;shell._player=event.target;
                const frame=holder.querySelector('iframe');
                if(frame){frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');frame.setAttribute('allow','autoplay; fullscreen; encrypted-media; picture-in-picture');frame.title='Video de producto';}
                safeYT(event.target,'mute');
                if(shell.dataset.active==='1')safeYT(event.target,'playVideo');else safeYT(event.target,'pauseVideo');
                ready();
              },
              onStateChange:function(event){
                if(event.data===YT.PlayerState.PLAYING){ready();}
                if(event.data===YT.PlayerState.ENDED&&shell.dataset.active==='1')safeYT(event.target,'playVideo');
              },
              onError:function(){clearTimeout(fallbackTimer);try{holder.remove();}catch(_){}fail();}
            }
          });
          record.player=player;shell._player=player;
        }).catch(()=>fail());
        return;
      }
      if(source.type==='vimeo'){mountFrame(`https://player.vimeo.com/video/${encodeURIComponent(source.id)}?autoplay=${active?1:0}&muted=1&loop=1&background=1&dnt=1&controls=0&playsinline=1`,'vimeo',760);return;}
      if(source.type==='tiktok'){mountFrame(`https://www.tiktok.com/player/v1/${encodeURIComponent(source.id)}?autoplay=${active?1:0}&muted=1&loop=1&controls=0&progress_bar=0&play_button=0&volume_control=0&fullscreen_button=0&timestamp=0&music_info=0&description=0&rel=0`,'tiktok',980);return;}
      if(source.type==='facebook'){mountFrame(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(source.url)}&show_text=false&autoplay=${active?1:0}&mute=1&width=900`,'facebook',1100);}
    }
    function activateMedia(shell){
      if(!shell)return;
      shell.dataset.active='1';
      mountMedia(shell,true);
      const r=state.records.get(shell);if(!r)return;
      if(r.video)safePlay(r.video);
      if(r.player){safeYT(r.player,'mute');safeYT(r.player,'playVideo');}
    }
    function deactivateMedia(shell){
      if(!shell)return;
      shell.dataset.active='0';
      const r=state.records.get(shell);if(!r)return;
      if(r.video)safePause(r.video);
      if(r.player)safeYT(r.player,'pauseVideo');
      /* Vimeo, TikTok, Facebook y Drive preview se desmontan para detenerlos por completo. */
      if(r.frame){try{r.frame.remove();}catch(_){}r.frame=null;shell.dataset.mounted='';state.records.delete(shell);shell.classList.remove('ready','frame');}
    }
    function chips(product){const p=preferred(product),out=[];if(p&&p.period)out.push(p.period);(p&&p.chips||[]).forEach(x=>out.push(x));if(!out.length&&p&&p.name)out.push(p.name);return [...new Set(out.map(text).filter(Boolean))].slice(0,3);}
    function heroSlide(product,index){
      const info=priceInfo(product),plan=preferred(product),isAvailable=available(product),price=info.value==null?'Consultar':(info.count>1?'Desde ':'')+money(info.value,(info.plan&&info.plan.currency)||'PEN'),note=info.value==null?'Ver planes':(info.count>1?`${info.count} planes disponibles`:(plan&&plan.period)||'Plan');
      const desc=text((plan&&plan.description)||product.description||'Revisa los planes disponibles en nuestra tienda.');
      const long=desc.length>175;
      const descId=`hero-desc-${index}`;
      return `<article class="slide ${index===0?'is-active':''}" data-slide="${index}" data-link="${esc(shopLink(product))}" tabindex="0"><div class="hero-media">${mediaMarkup(product,'hero')}</div><div class="hero-copy"><div class="eyebrow"><span class="tag"><i class="fa-solid ${categoryIcon(product.category)}"></i>${esc(category(product.category))}</span><span class="availability ${isAvailable?'':'off'}"><i class="fa-solid fa-circle"></i>${isAvailable?'Disponible':'Consultar'}</span></div><h1>${esc(product.name)}</h1><div class="price"><strong>${esc(price)}</strong><span>${esc(note)}</span></div><div class="chips">${chips(product).map(x=>`<span class="chip"><i class="fa-solid fa-check"></i>${esc(x)}</span>`).join('')}</div><div class="description-wrap"><p class="description" id="${descId}">${esc(desc)}</p>${long?`<button class="description-toggle" type="button" data-read-more="${descId}" aria-expanded="false">Leer más <i class="fa-solid fa-chevron-down"></i></button>`:''}</div><div class="actions"><a class="btn-store" href="${esc(shopLink(product))}"><i class="fa-solid fa-store"></i> Ver planes en tienda</a><span class="action-note">Elige tu plan dentro de la tienda</span></div><div class="trust-mini"><span><i class="fa-solid fa-tags"></i> Precios reales</span><span><i class="fa-solid fa-headset"></i> Soporte disponible</span></div></div></article>`;
    }
    function promoCard(product){const info=priceInfo(product),plan=preferred(product),price=info.value==null?'Ver planes':(info.count>1?'Desde ':'')+money(info.value,(info.plan&&info.plan.currency)||'PEN'),meta=category(product.category)+(plan&&plan.period?' · '+plan.period:'');return `<a class="promo" href="${esc(shopLink(product))}" aria-label="Abrir ${esc(product.name)} en tienda"><div class="promo-media">${mediaMarkup(product,'promo')}</div><div class="promo-copy"><small>${esc(meta)}</small><h2>${esc(product.name)}</h2><b><i class="fa-solid fa-store"></i>${esc(price)}</b></div></a>`;}
    function lowerCard(product){const info=priceInfo(product),plan=preferred(product),price=info.value==null?'Consultar':(info.count>1?'Desde ':'')+money(info.value,(info.plan&&info.plan.currency)||'PEN');return `<a class="chosen-card" href="${esc(shopLink(product))}" aria-label="Abrir ${esc(product.name)} en tienda"><span class="chosen-media">${fallbackHtml(product)}</span><span class="chosen-meta"><small>${esc(category(product.category))}</small><strong>${esc(product.name)}</strong><b>${esc(price)}</b><span>${esc((plan&&plan.period)||'Ver planes')}</span></span><i class="fa-solid fa-arrow-right"></i></a>`;}

    function resetProgress(){
      const bar=$('progress');if(!bar)return;
      bar.style.transition='none';bar.style.width='0%';clearTimeout(state.progressTimer);
      if(state.paused||state.manualPause)return;
      state.progressTimer=setTimeout(()=>{bar.style.transition=`width ${Math.max(300,state.seconds*1000-80)}ms linear`;bar.style.width='100%';},35);
    }
    function renderDots(count){
      $('dots').innerHTML=Array.from({length:count},(_,i)=>`<button class="dot ${i===0?'active':''}" data-dot="${i}" type="button" aria-label="Ver destacado ${i+1}"></button>`).join('');
      [...document.querySelectorAll('[data-dot]')].forEach(btn=>btn.addEventListener('click',()=>{const n=Number(btn.dataset.dot);setSlide(n,n>=state.active?1:-1);restartAuto();}));
    }
    function setSlide(target,direction=1){
      const list=[...document.querySelectorAll('[data-slide]')];if(list.length<2){if(list[0])activateMedia(list[0].querySelector('.js-media'));resetProgress();return;}
      const next=((target%list.length)+list.length)%list.length;
      const old=list[state.active],incoming=list[next];
      if(next===state.active){activateMedia(incoming.querySelector('.js-media'));resetProgress();return;}
      clearTimeout(state.slideTimer);
      if(old){old.classList.add('is-leaving');old.classList.remove('from-left','to-right');if(direction<0)old.classList.add('to-right');deactivateMedia(old.querySelector('.js-media'));}
      incoming.classList.add('is-active');incoming.classList.remove('is-leaving','to-right');if(direction<0)incoming.classList.add('from-left');
      activateMedia(incoming.querySelector('.js-media'));
      state.active=next;
      [...document.querySelectorAll('[data-dot]')].forEach((x,i)=>x.classList.toggle('active',i===next));
      state.slideTimer=setTimeout(()=>{list.forEach((s,i)=>{if(i!==next)s.classList.remove('is-active','is-leaving','to-right','from-left');});incoming.classList.remove('from-left');},700);
      resetProgress();
    }
    function stopAuto(){
      if(state.autoTimer){clearInterval(state.autoTimer);state.autoTimer=null;}
      clearTimeout(state.progressTimer);
    }
    function startAuto(){
      stopAuto();
      if(state.manualPause||state.paused)return;
      const count=document.querySelectorAll('[data-slide]').length;
      resetProgress();
      if(count<2)return;
      /* Intervalo directo: no depende de hover ni de preferencias del navegador. */
      state.autoTimer=setInterval(()=>{if(!state.manualPause&&!state.paused)setSlide(state.active+1,1);},Math.max(3000,state.seconds*1000));
    }
    function restartAuto(){startAuto();}
    function bindHero(){
      const hero=$('hero');
      $('prev').onclick=()=>{setSlide(state.active-1,-1);restartAuto();};
      $('next').onclick=()=>{setSlide(state.active+1,1);restartAuto();};
      $('pause').onclick=()=>{state.manualPause=!state.manualPause;$('pause').innerHTML=state.manualPause?'<i class="fa-solid fa-play"></i>':'<i class="fa-solid fa-pause"></i>';$('pause').setAttribute('aria-label',state.manualPause?'Reanudar carrusel':'Pausar carrusel');state.manualPause?stopAuto():startAuto();};
      hero.onmouseenter=()=>hero.classList.add('is-hovering');
      hero.onmouseleave=()=>hero.classList.remove('is-hovering');
      hero.onclick=e=>{
        const toggle=e.target.closest('[data-read-more]');
        if(toggle){const desc=$(toggle.dataset.readMore);const expanded=toggle.getAttribute('aria-expanded')==='true';if(desc)desc.classList.toggle('is-expanded',!expanded);toggle.setAttribute('aria-expanded',String(!expanded));toggle.innerHTML=!expanded?'Leer menos <i class="fa-solid fa-chevron-up"></i>':'Leer más <i class="fa-solid fa-chevron-down"></i>';return;}
        if(e.target.closest('a,button'))return;
        const s=e.target.closest('[data-slide]');if(s&&s.dataset.link)location.href=s.dataset.link;
      };
      hero.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-slide]')){e.preventDefault();location.href=e.target.dataset.link;}};
      document.onvisibilitychange=()=>{if(document.hidden){state.paused=true;stopAuto();document.querySelectorAll('.js-media').forEach(deactivateMedia);}else{state.paused=false;activateMedia(document.querySelector('[data-slide].is-active .js-media'));if(!state.manualPause)startAuto();}};
    }
    function render(products,cfg){
      const pick=selected(products,cfg);state.seconds=clamp(Number(cfg.seconds)||5,3,10);const slides=$('slides');
      if(!pick.hero.length){slides.innerHTML='<div class="home-empty" style="min-height:385px;display:grid;place-content:center;gap:10px;text-align:center;color:#69778a"><i class="fa-solid fa-box-open" style="font-size:1.5rem;color:#f7b900"></i><strong style="color:#1c2a3d">Aún no hay destacados configurados</strong><span style="font-size:.8rem;font-weight:700">Elige uno o varios productos desde el administrador.</span></div>';$('promos').innerHTML='';return;}
      stopAuto();
      slides.innerHTML=pick.hero.map(heroSlide).join('');
      $('promos').innerHTML=pick.promos.map(promoCard).join('');
      $('homeGrid').classList.toggle('without-promos',!pick.promos.length);
      const selectedBox=$('chosen');if(pick.bottom.length){$('chosenGrid').innerHTML=pick.bottom.map(lowerCard).join('');selectedBox.hidden=false;}else{selectedBox.hidden=true;$('chosenGrid').innerHTML='';}
      state.active=0;state.manualPause=false;state.paused=false;renderDots(pick.hero.length);bindHero();
      document.querySelectorAll('.promo .js-media').forEach(shell=>mountMedia(shell,true));
      requestAnimationFrame(()=>{const first=document.querySelector('[data-slide].is-active .js-media');activateMedia(first);resetProgress();setTimeout(startAuto,90);});
    }

    function external(value){const raw=text(value);if(!raw)return '';const valueWithProtocol=/^https?:\/\//i.test(raw)?raw:'https://'+raw.replace(/^\/+/, '');try{const u=new URL(valueWithProtocol);return /^https?:$/.test(u.protocol)?u.href:'';}catch(_){return '';}}
    function waBase(value){const raw=text(value);if(/^\+?\d{7,15}$/.test(raw))return 'https://wa.me/'+raw.replace(/\D/g,'');const safe=external(raw);if(/wa\.me\/\d+/i.test(safe)||/api\.whatsapp\.com\/send/i.test(safe))return safe;return DEFAULT_SOCIAL.whatsapp_url;}
    function supportUrl(social){const raw=waBase(social.support_whatsapp_url||social.whatsapp_url||DEFAULT_SOCIAL.support_whatsapp_url);const message=String(social.support_message||DEFAULT_SOCIAL.support_message||'').trim();try{const u=new URL(raw);if(/wa\.me$/i.test(u.hostname)&&/^\/\d+\/?$/.test(u.pathname)){u.searchParams.set('text',message);return u.href;}if(/api\.whatsapp\.com$/i.test(u.hostname)&&/\/send/i.test(u.pathname)){u.searchParams.set('text',message);return u.href;}}catch(_){}return raw;}

    function bindLegalDialogs(){
      const links={terms:['termsLink','termsBottomLink'],privacy:['privacyLink','privacyBottomLink'],faq:['faqLink'],help:['helpLink']};
      Object.keys(links).forEach(kind=>{
        const dialog=$(kind==='terms'?'termsModal':kind==='privacy'?'privacyModal':kind==='faq'?'faqModal':'helpModal');
        if(!dialog)return;
        links[kind].forEach(id=>{const link=$(id);if(link)link.addEventListener('click',event=>{event.preventDefault();if(typeof dialog.showModal==='function')dialog.showModal();});});
        dialog.addEventListener('click',event=>{if(event.target===dialog&&typeof dialog.close==='function')dialog.close();});
      });
      document.querySelectorAll('[data-close-legal]').forEach(button=>button.addEventListener('click',()=>{const dialog=$(button.getAttribute('data-close-legal'));if(dialog&&typeof dialog.close==='function')dialog.close();}));
      try{const requested=new URLSearchParams(location.search).get('open');const target=requested==='privacy'?'privacyModal':requested==='faq'?'faqModal':requested==='help'?'helpModal':requested==='terms'?'termsModal':'';if(target){const dialog=$(target);if(dialog&&typeof dialog.showModal==='function')setTimeout(()=>dialog.showModal(),0);}}catch(_){}
    }
    function applySocial(raw){const data={...DEFAULT_SOCIAL,...json(raw)};const wa=waBase(data.whatsapp_url);const sup=supportUrl(data);const set=(id,href)=>{const el=$(id);if(!el)return;if(!href){el.hidden=true;return;}el.hidden=false;el.href=href;};const setClass=(cls,href)=>document.querySelectorAll('.'+cls).forEach(el=>{if(!href){el.hidden=true;return;}el.hidden=false;el.href=href;});set('whatsappFab',wa);set('supportHeader',sup);set('supportFooter',sup);set('helpSupportLink',sup);set('helpActivationLink',sup);setClass('header-social-facebook',external(data.facebook_url));setClass('header-social-tiktok',external(data.tiktok_url));setClass('header-social-instagram',external(data.instagram_url));}
    function cartCount(){try{const raw=sessionStorage.getItem(CART_KEY)||localStorage.getItem(CART_KEY)||'[]';return JSON.parse(raw).reduce((n,x)=>n+Number(x.qty||1),0);}catch(_){return 0;}}
    function syncCart(){$('cartCount').textContent=cartCount();}
    async function init(){syncCart();$('year').textContent=new Date().getFullYear();const header=$('innovHeader'),menu=$('innovMenu');menu.addEventListener('click',()=>{const open=header.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});bindLegalDialogs();if(!window.supabase){console.warn('Supabase no cargó');return;}try{const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);const [catalog,home,social]=await Promise.all([db.rpc('get_public_catalog'),db.rpc(SETTINGS_RPC),db.rpc(SOCIAL_RPC)]);if(catalog.error)throw catalog.error;applySocial(social&&social.error?{}:social.data);render(buildCatalog(catalog.data||[]),config(home&&home.error?{}:home.data));}catch(error){console.error('No se pudo cargar la portada',error);$('slides').innerHTML='<div class="home-empty" style="min-height:385px;display:grid;place-content:center;gap:10px;text-align:center;color:#69778a"><i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem;color:#e09519"></i><strong style="color:#1c2a3d">No se pudieron actualizar los destacados</strong><span style="font-size:.8rem;font-weight:700">Recarga la página o revisa la configuración de Supabase.</span></div>';}}
    window.addEventListener('storage',e=>{if(e.key===CART_KEY)syncCart();});
    init();
  })();
