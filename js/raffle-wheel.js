(()=>{
'use strict';
function escName(v){return String(v||'Participante').trim()||'Participante'}
function normalizeParticipants(items=[]){return items.map((p,i)=>({id:String(p.id||p.participant_id||i),name:escName(p.display_name||p.name),isSelf:!!p.is_self}))}
function normalizeWinners(items=[]){return items.map((w,i)=>({position:Number(w.position||i+1),participantId:String(w.participant_id||w.id||''),name:escName(w.display_name||w.name),isSelf:!!w.is_self}))}
function logoImage(src){return new Promise(resolve=>{if(!src)return resolve(null);const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src})}
async function play(opts={}){
 const canvas=opts.canvas;if(!canvas||!canvas.getContext)throw new Error('Ruleta no disponible.');
 const participants=normalizeParticipants(opts.participants||[]),winners=normalizeWinners(opts.winners||[]);if(!participants.length||!winners.length)throw new Error('El sorteo todavía no tiene un resultado reproducible.');
 const ctx=canvas.getContext('2d'),size=Number(canvas.width||520),center=size/2,radius=center-25,N=participants.length;
 const logo=await logoImage(opts.logoSrc||'assets/img/logo.png');let current=0;
 function draw(rotation=0){
  current=rotation;ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(center,center);ctx.rotate(rotation);
  const step=2*Math.PI/N,labelEvery=N<=36?1:Math.ceil(N/36);
  for(let i=0;i<N;i++){
   const p=participants[i],a0=i*step,a1=(i+1)*step;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,radius,a0,a1);ctx.closePath();
   ctx.fillStyle=p.isSelf?'#5d4c0d':(i%2?'#17243a':'#22314a');ctx.fill();ctx.strokeStyle='rgba(255,255,255,.10)';ctx.lineWidth=.8;ctx.stroke();
   if(i%labelEvery===0){ctx.save();ctx.rotate((a0+a1)/2);ctx.translate(radius*.64,0);ctx.rotate(Math.PI/2);ctx.fillStyle=p.isSelf?'#facc15':'#e2e8f0';ctx.font=`700 ${Math.max(8,Math.min(15,155/Math.max(8,Math.min(N,36))+8))}px DM Sans,Arial`;ctx.textAlign='center';ctx.textBaseline='middle';const max=N>50?9:14;ctx.fillText(p.name.slice(0,max),0,0);ctx.restore()}
  }
  ctx.restore();ctx.beginPath();ctx.arc(center,center,Math.max(42,size*.10),0,Math.PI*2);ctx.fillStyle='#091426';ctx.fill();ctx.strokeStyle='rgba(250,204,21,.3)';ctx.lineWidth=2;ctx.stroke();
  if(logo){const s=Math.max(48,size*.115);ctx.drawImage(logo,center-s/2,center-s/2,s,s)}
 }
 draw(current);let wi=0;
 return await new Promise(resolve=>{
  const next=()=>{
   if(wi>=winners.length){opts.onComplete?.(winners);resolve(winners);return}
   const w=winners[wi];let idx=participants.findIndex(p=>p.id===w.participantId);if(idx<0)idx=participants.findIndex(p=>p.name===w.name);if(idx<0)idx=0;
   const step=2*Math.PI/N,target=-(idx+.5)*step-Math.PI/2,turns=6+Math.min(wi,3),startRotation=current,final=target-turns*2*Math.PI,duration=Number(opts.duration||3400),start=performance.now();
   const frame=t=>{const q=Math.min(1,(t-start)/duration),ease=1-Math.pow(1-q,4),rot=startRotation+(final-startRotation)*ease;draw(rot);if(q<1)requestAnimationFrame(frame);else{current=final;opts.onWinner?.(w,wi);wi++;setTimeout(next,Number(opts.pause||500))}};requestAnimationFrame(frame)
  };next()
 })
}
window.InnovRaffleWheel={play};
})();
