import {viewportRect} from './viewport.js';
import {agentEnabled,soundMode} from './preferences.js';
import {readWatchPose} from './mechanism-memory.js';
import {signature as c,clamp,createWatchState,advanceWatch,watchMoving,watchAngles,agentRotation} from './mechanism-profile.js';
import {createSignatureStress,signatureStress,createSignatureAppearance} from './mechanism-surface.js';
import {createWatchSound} from './mechanism-sound.js';

export function initLessonMechanism({openAgentView}){
 const host=document.querySelector('[data-lesson-mechanism]');if(!host)return;
 host.dataset.profile='balance-signature';
 const s=createWatchState(),parts=Object.fromEntries([...host.querySelectorAll('[data-turn]')].map(p=>[p.dataset.turn,p]));
 const sound=createWatchSound(soundMode),stress=createSignatureStress(host),material=createSignatureAppearance(host);
 let frame=0,last=0,gesture=null,coast=false,ritual=null,suppressClick=0,micro=0,microVelocity=0,previousVelocity=0;
 let feedbackAt=-Infinity,markerOffset=0,lastTop=scrollY,intentUntil=0,radius=36,checkpoint=0,kind='action',kindAt=0,paused=false;
 const allowed=()=>document.documentElement.dataset.motion!=='off'&&!document.hidden;
 const rim=document.createElement('span'),point=document.createElement('span');
 rim.className='watch-rim-hit';point.className='watch-point-hit';rim.setAttribute('aria-hidden','true');point.setAttribute('aria-hidden','true');host.append(rim,point);
 let dialBox={left:0,top:0,width:0,height:0};
 function label(){
  host.dataset.state=gesture?'drag':ritual?'agent-open':watchMoving(s)?kind:'idle';
  const open=document.body.dataset.appView==='agent';host.dataset.agent=open?'open':'closed';host.setAttribute('aria-expanded',String(open));
  host.setAttribute('aria-label',agentEnabled()?'Часовой механизм. Enter — открыть ИИ-агента. Стрелки — вращать; Shift — точно.':'Часовой механизм. Стрелки — вращать; Shift — точно.');
 }
 function paint(){
  const angles=watchAngles({...s,angle:s.angle+micro,gear:s.gear+micro});
  ['wheel','transfer','escape'].forEach((name,i)=>parts[name].setAttribute('transform',`rotate(${angles[i]%(360*156)})`));
  parts.index.setAttribute('transform',`rotate(${(s.angle+markerOffset+micro)%360} 160 160)`);
  const torque=clamp((s.target-s.angle)*.35,-12,12);
  parts.balance.setAttribute('transform',`rotate(${torque})`);parts.lever.setAttribute('transform',`rotate(${-torque*.4})`);material(s.angle);
  const a=(s.angle+markerOffset-90)*Math.PI/180,r=dialBox.width*131/320;
  point.style.left=dialBox.left+dialBox.width/2+Math.cos(a)*r-10+'px';point.style.top=dialBox.top+dialBox.height/2+Math.sin(a)*r-10+'px';
  label();return angles;
 }
 function capture(){
  const torque=clamp((s.target-s.angle)*.35,-12,12);
  return {drive:(s.angle+micro)*2.4,index:s.angle+markerOffset+micro,gearDrive:(s.gear+micro)*2.4,balance:torque,lever:-torque*.4,
   physical:{angle:s.angle,target:s.target,transmitted:s.transmitted,gear:s.gear,velocity:s.velocity,gearVelocity:s.gearVelocity,at:Date.now(),source:location.href}};
 }
 function restore(pose){
  if(!pose)return;
  const oldAngle=s.angle;s.angle=pose.drive/2.4;markerOffset=pose.index-s.angle;s.gear=(pose.gearDrive??pose.drive)/2.4;s.target=s.transmitted=s.angle;
  s.velocity=s.gearVelocity=0;micro=microVelocity=previousVelocity=0;s.accumulator=0;
  const p=pose.physical;
  try{
   const nav=performance.getEntriesByType('navigation')[0]?.type,transfer=JSON.parse(sessionStorage.getItem('unknowntalks:page-transfer:v1')||'null');
   if(p&&Date.now()-p.at<1400&&Date.now()>=p.at&&transfer?.to===location.href&&nav==='navigate'&&allowed()&&['angle','target','transmitted','gear','velocity','gearVelocity'].every(key=>Number.isFinite(p[key]))){
    Object.assign(s,{angle:p.angle,target:p.target,transmitted:p.transmitted,gear:p.gear,velocity:clamp(p.velocity,-c.maxVelocity,c.maxVelocity),gearVelocity:clamp(p.gearVelocity,-c.maxVelocity*2,c.maxVelocity*2)});markerOffset=pose.index-s.angle;
   }
  }catch{}
  if(ritual)ritual.base+=s.angle-oldAngle;
  lastTop=scrollY;paint();if(watchMoving(s))wake();
 }
 function wake(){if(!frame&&allowed()&&!paused){last=performance.now();frame=requestAnimationFrame(tick);}}
 function park(){s.target=s.transmitted=s.angle;s.velocity=s.gearVelocity=0;s.gear=s.angle;s.accumulator=0;micro=microVelocity=previousVelocity=0;coast=false;}
 function stop(){cancelAnimationFrame(frame);frame=0;ritual=null;gesture=null;park();stress.reset();sound.silence(true);paint();}
 function tick(now){
  frame=0;if(!allowed()||paused){stop();return;}
  const dt=clamp((now-last)/1000,0,.064);last=now;
  if(ritual){
   const point=agentRotation(now-ritual.start);s.angle=s.target=s.transmitted=s.gear=ritual.base+point.angle;s.velocity=point.velocity;s.gearVelocity=point.velocity;
   if(now-ritual.start>=1300){ritual=null;park();}
  }else advanceWatch(s,dt,{held:!!gesture,coast});
  if(coast&&!s.velocity)coast=false;
  const load=clamp((s.velocity-previousVelocity)/Math.max(.004,dt)*.004,-80,80);
  for(let left=dt;left>0;){const h=Math.min(1/240,left);microVelocity+=(load-220*micro-14*microVelocity)*h;micro+=microVelocity*h;left-=h;}
  micro=clamp(micro,-.5,.5);if(Math.abs(micro)<.002&&Math.abs(microVelocity)<.01)micro=microVelocity=0;previousVelocity=s.velocity;
  const particles=stress.step(signatureStress,s.velocity,dt,now,false),angles=paint();
  const source=gesture||ritual?'watch':kind;
  sound.motion(angles[2],coast?0:s.gearVelocity*60/13,now,{source,activationAge:ritual?now-ritual.start:null});
  if(now-checkpoint>250){window.UnknownTalksPage?.saveWatch();checkpoint=now;}
  if(ritual||gesture||watchMoving(s)||micro||microVelocity||particles)frame=requestAnimationFrame(tick);
 }
 function input(delta,source='watch'){
  if(ritual||document.hidden||paused)return;if(source!=='scroll'){intentUntil=0;lastTop=scrollY;}kind=source;kindAt=performance.now();coast=false;s.target+=delta;
  if(!allowed()){const target=s.target;park();s.angle=s.target=s.transmitted=s.gear=target;paint();sound.tap(source,1);return;}
  wake();
 }
 function feedback(eventKind,source='action'){
  if(ritual||gesture||performance.now()-feedbackAt<90)return;feedbackAt=performance.now();
  const delta={transition:9,unfold:4,save:6,message:3,denied:-1.5}[eventKind]??2;
  input(delta,source);
 }
 function openAgent(){
  if(!agentEnabled()||ritual)return;
  if(document.body.dataset.appView==='agent'){document.getElementById('mechanism-agent-title')?.focus({preventScroll:true});return;}
  coast=false;kind='watch';kindAt=performance.now();
  if(allowed()){ritual={start:performance.now(),base:s.angle};wake();}else sound.tap('watch',3);
  openAgentView();label();
 }
 host.addEventListener('click',event=>{
  if(event.detail!==0&&performance.now()<suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=0;return;}openAgent();
 });
 function pointerAngle(e,g){return Math.atan2(e.clientY-g.cy,e.clientX-g.cx)*180/Math.PI;}
 function begin(e){
  if(ritual||gesture||e.button!==0||!e.isPrimary)return;
  const box=viewportRect(host.querySelector('svg'));
  gesture={id:e.pointerId,element:e.currentTarget,cx:box.left+box.width/2,cy:box.top+box.height/2,x:e.clientX,y:e.clientY,at:performance.now(),moved:false,base:s.angle,baseMarker:markerOffset,releaseVelocity:0};
  gesture.previous=pointerAngle(e,gesture);coast=false;s.velocity=0;s.target=s.angle;kind='watch';gesture.element.setPointerCapture(e.pointerId);wake();
 }
 function move(e){
  const g=gesture;if(!g||e.pointerId!==g.id)return;
  const now=performance.now(),angle=pointerAngle(e,g),diff=(angle-g.previous+540)%360-180,dt=Math.max(.004,(now-g.at)/1000);
  if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>4)g.moved=true;
  if(g.moved){const precision=e.shiftKey||Math.abs(diff/dt)<25?c.precision:1,resistance=1/(1+Math.abs(diff/dt)/1800),delta=clamp(diff*precision*resistance,-c.maxVelocity*dt,c.maxVelocity*dt);s.angle+=delta;s.target=s.transmitted=s.angle;s.velocity=delta/dt;g.releaseVelocity=g.releaseVelocity*.45+s.velocity*.55;}
  g.previous=angle;g.at=now;wake();
  if(!allowed()){s.gear=s.angle;paint();if(g.moved)sound.tap('watch',1);}
 }
 function end(e,cancel=false){
  const g=gesture;if(!g||e.pointerId!==g.id)return;gesture=null;suppressClick=performance.now()+500;host.classList.remove('is-pressed');
  if(g.element.hasPointerCapture(g.id))g.element.releasePointerCapture(g.id);
  if(cancel){s.angle=g.base;markerOffset=g.baseMarker;park();}
  else if(g.moved){s.velocity=performance.now()-g.at<100?g.releaseVelocity:0;coast=allowed()&&Math.abs(s.velocity)>c.stop;if(!coast){s.velocity=0;s.target+=.35;}}
  if(coast)kind='watch';paint();wake();window.UnknownTalksPage?.saveWatch();
 }
 for(const surface of [rim,point]){
  surface.addEventListener('pointerdown',begin);surface.addEventListener('pointermove',move);surface.addEventListener('pointerup',e=>end(e));surface.addEventListener('pointercancel',e=>end(e,true));surface.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)end(e,true);});
 }
 host.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key)||ritual)return;e.preventDefault();input((e.key==='ArrowRight'?1:-1)*(e.shiftKey?c.precision:6));});
 host.addEventListener('pointerenter',()=>host.classList.add('is-hovered'));host.addEventListener('pointerleave',()=>host.classList.remove('is-hovered'));
 host.addEventListener('pointerdown',()=>{suppressClick=0;host.classList.add('is-pressed');});addEventListener('pointerup',()=>host.classList.remove('is-pressed'));
 addEventListener('keydown',e=>{if(e.key==='Escape'&&(gesture||ritual)){if(gesture)end({pointerId:gesture.id},true);ritual=null;park();paint();sound.silence();}});
 function intend(e){if(!e.ctrlKey&&!e.target?.closest?.('input,textarea,select,[contenteditable=true]'))intentUntil=performance.now()+1200;}
 addEventListener('wheel',intend,{passive:true});for(const name of ['touchstart','touchmove','touchend'])addEventListener(name,intend,{passive:true});
 addEventListener('keydown',e=>{if(!e.defaultPrevented&&['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key))intend(e);});
 addEventListener('scroll',()=>{
  const now=performance.now(),top=clamp(scrollY,0,Math.max(0,document.documentElement.scrollHeight-innerHeight)),delta=top-lastTop;lastTop=top;
  if(!allowed()||gesture||ritual||now>intentUntil||!delta)return;
  input(delta/radius*180/Math.PI*c.ratio,'scroll');
 },{passive:true});
 function measure(){const dial=host.querySelector('.lesson-mechanism-case');dialBox={left:dial.offsetLeft,top:dial.offsetTop,width:dial.offsetWidth,height:dial.offsetHeight};radius=viewportRect(host.querySelector('svg')).width*131/320;rim.style.cssText=`left:${dialBox.left}px;top:${dialBox.top}px;width:${dialBox.width}px;height:${dialBox.height}px;`;stress.resize();lastTop=scrollY;paint();}
 document.addEventListener('mechanism:feedback',e=>feedback(e.detail.kind,e.detail.source));
 document.addEventListener('click',e=>{if(!e.isTrusted||e.defaultPrevented||e.target.closest('[data-lesson-mechanism]'))return;if(e.target.closest('button,a,summary,input[type=checkbox],select'))feedback('transition',e.target.closest('.mobile-menu-open,.mobile-menu-close')?'watch':'action');},true);
 document.addEventListener('unknowntalks:view',()=>{if(ritual&&document.body.dataset.appView!=='agent'){ritual=null;park();}lastTop=scrollY;label();});
 document.addEventListener('unknowntalks:preferences',()=>{host.setAttribute('aria-disabled',String(!agentEnabled()));if(!agentEnabled()&&ritual){ritual=null;park();}measure();});
 new MutationObserver(()=>{if(!allowed())stop();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){window.UnknownTalksPage?.saveWatch();stop();}else{last=performance.now();lastTop=scrollY;}});
 addEventListener('pagehide',()=>{window.UnknownTalksPage?.saveWatch();paused=true;stop();});addEventListener('pageshow',()=>{paused=false;lastTop=scrollY;});
 addEventListener('resize',measure,{passive:true});new ResizeObserver(measure).observe(host);
 window.UnknownTalksPage?.attachWatch({capture,restore,prepare(){paused=true;cancelAnimationFrame(frame);frame=0;sound.silence(true);}});restore(readWatchPose());measure();label();
}
