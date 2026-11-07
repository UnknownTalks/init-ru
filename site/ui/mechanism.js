import {createMechanismFriction} from './mechanism-friction.js';
import {agentEnabled} from './preferences.js';

export function initLessonMechanism({openAgentView}){

const host=document.querySelector('[data-lesson-mechanism]');
if(!host)return;
const friction=createMechanismFriction(host);
const parts=[...host.querySelectorAll('[data-mechanism]')].map(svg=>Object.fromEntries([...svg.querySelectorAll('[data-turn]')].map(el=>[el.dataset.turn,el])));
const springs=[...host.querySelectorAll('[data-spring]')];
const clamp=t=>Math.max(0,Math.min(1,t)),ease=t=>{t=clamp(t);return t*t*(3-2*t);};
const agentWindDuration=650,agentSettleDuration=650;
// Three complete turns, including the deceleration. Navigation runs alongside.
const agentTopSpeed=360*3/(agentWindDuration/2+agentSettleDuration/3);
const allowed=()=>document.documentElement.dataset.motion!=='off'&&!document.hidden;
let position={drive:0,index:0,balance:0,lever:0},active=null,waiting=null,frame=0,last=0;
let agentPhase='closed',forwardDrive=0,forwardIndex=0,playbackKind=null;
// Chosen ×4 slower motion: 100 px of page travel moves the dial marker 6.25 px.
const scrollMode={gain:.0625,lag:45};
let scrollTarget=0,scrollShown=0,scrollAt=0,scrollIntentUntil=0,lastScrollTop=scrollY,scrollRadius=36;
function label(kind){
 if(host.dataset.state!==kind)host.dataset.state=kind;
 const name=!agentEnabled()?'Часовой механизм. ИИ-агент выключен':kind==='agent-close'?'Механизм возвращается':document.body.dataset.appView==='agent'?'ИИ-агент открыт':kind==='agent-open'?'Открываем ИИ-агента':'Открыть ИИ-агента';
 if(host.title!==name){host.title=name;host.setAttribute('aria-label',name);}
}
function paint(value){
 position=value;
 for(const p of parts){
  p.wheel.setAttribute('transform',`rotate(${value.drive})`);p.transfer.setAttribute('transform',`rotate(${-value.drive*1.25})`);p.escape.setAttribute('transform',`rotate(${value.drive*25/13})`);
  p.balance.setAttribute('transform',`rotate(${value.balance})`);p.lever.setAttribute('transform',`rotate(${value.lever})`);p.index.setAttribute('transform',`rotate(${value.index} 160 160)`);
 }
 const path='M'+Array.from({length:110},(_,i)=>{const t=i/109,a=t*Math.PI*8+value.balance*Math.PI/180*(1-t),r=3+t*23;return (Math.cos(a)*r).toFixed(2)+','+(Math.sin(a)*r).toFixed(2);}).join('L');
 for(const spring of springs)spring.setAttribute('d',path);
}
function wake(){if(!frame&&allowed()){last=performance.now();frame=requestAnimationFrame(tick);}}
function feedback(kind,duration=360){
 // Navigation can also start through browser history or a chapter link.
 if(kind==='transition'&&agentPhase==='open'&&new URL(location.href).searchParams.get('view')!=='agent')rewindAgent();
 if(agentPhase!=='closed')return;
 if(!allowed())return;
 if(active?.kind===kind&&kind==='transition')return;
 resetScroll();
 active={kind,duration:kind==='transition'?375:duration,elapsed:0,base:{...position}};label(kind);wake();
}
function resetScroll({keepFriction=false}={}){
 if(!keepFriction)friction.reset();
 scrollTarget=scrollShown=0;scrollAt=0;scrollIntentUntil=0;lastScrollTop=Math.max(0,scrollY);
 if(active?.kind==='scroll'){active=null;paint({...position,balance:0,lever:0});label(waiting||'idle');}
}
function measureScroll(){
 // The ivory marker's centre is 131 SVG units from the dial's centre.
 // Use its rendered CSS radius, so a pixel of arc really is a screen pixel
 // on both the 88 px desktop watch and the smaller mobile watch.
 scrollRadius=host.querySelector('[data-mechanism]').getBoundingClientRect().width*131/320;
 friction.resize();
 resetScroll();
}
function stop(complete=true){
 cancelAnimationFrame(frame);frame=0;active=null;resetScroll();paint({...position,balance:0,lever:0});
 // Turning motion off or hiding the tab must never strand the reader halfway
 // through opening a page. Navigation still completes without further motion.
 if(complete&&agentPhase==='opening')setAgentPhase('open');
 else if(complete&&agentPhase==='closing')finishRewind();
 else label(agentPhase==='open'?'agent':'idle');
}
function setAgentPhase(phase){
 agentPhase=phase;host.dataset.agent=phase;
 host.setAttribute('aria-disabled',String(!agentEnabled()));
 host.setAttribute('aria-expanded',String(phase==='open'));
}
function openAgent(){
 if(!agentEnabled())return;
 if(agentPhase==='open'){document.getElementById('mechanism-agent-title').focus({preventScroll:true});return;}
 if(agentPhase==='opening')return;
 resetScroll();waiting=null;forwardDrive=forwardIndex=0;setAgentPhase('opening');
 if(allowed()){
  active={kind:'agent-open',duration:agentWindDuration,elapsed:0,base:{...position}};label('agent-open');wake();
 }else setAgentPhase('open');
 openAgentView();
}
function finishRewind(){
 active=null;forwardDrive=forwardIndex=0;setAgentPhase('closed');
 document.getElementById('mechanism-agent-status').textContent='';
 playback();label(waiting||'idle');
}
function rewindAgent(){
 if(agentPhase!=='opening'&&agentPhase!=='open')return;
 resetScroll();waiting=null;setAgentPhase('closing');
 if(!allowed()||!forwardDrive){finishRewind();return;}
 // Rewind half the distance actually wound, including an interrupted launch.
 active={kind:'agent-close',duration:950,elapsed:0,base:{...position},drive:forwardDrive/2,index:forwardIndex/2};
 label('agent-close');wake();
}
host.addEventListener('click',openAgent);
document.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const navigation=event.target.closest('[data-view-nav],[data-read-return],[data-view-back]');
 if(navigation)rewindAgent();
},true);
addEventListener('popstate',()=>{
 if(new URL(location.href).searchParams.get('view')!=='agent')rewindAgent();
});
function advanceScroll(now,dt){
 const a=active;a.elapsed+=dt;
 const target=scrollTarget;
 let next=scrollShown+(target-scrollShown)*(1-Math.exp(-dt/scrollMode.lag));
 // Preserve the same short settling period in either direction. Changing
 // speed changes the transmission ratio, not the lag behind the page.
 if(now-scrollAt>=180||Math.abs(target-next)<1e-7)next=target;
 const delta=next-scrollShown;scrollShown=next;
 a.speed+=(Math.abs(delta)*1000/Math.max(1,dt)-a.speed)*(1-Math.exp(-dt/60));
 a.phase+=Math.min(4,.65+a.speed/140)*dt/1000*Math.PI*2;
 const returning=1-ease(a.elapsed/80),amplitude=Math.min(16,a.speed*.12)*clamp(1-(now-scrollAt)/120);
 const settled=Math.abs(target-scrollShown)<1e-7&&now-scrollAt>=120;
 paint({drive:position.drive+delta*2.4,index:position.index+delta,
  balance:settled?0:a.baseBalance*returning+Math.sin(a.phase)*amplitude,
  lever:settled?0:a.baseLever*returning-Math.sin(a.phase)*amplitude*.4});
 if(settled){active=null;label(waiting||'idle');}
}
function tick(now){
 frame=0;if(!allowed()){stop();return;}
 // A scroll event can wake this loop after the frame's timestamp was sampled.
 // Never integrate a negative first step into the distance follower.
 const dt=Math.max(0,Math.min(64,now-last));last=now;
 const materialMoving=friction.tick(now,dt);
 if(active?.kind==='scroll'){
  advanceScroll(now,dt);
  if(active||waiting||materialMoving)frame=requestAnimationFrame(tick);
  return;
 }
 if(!active&&waiting)active={kind:waiting,duration:800,elapsed:0,base:{...position},continuous:true};
 if(!active){label(agentPhase==='open'?'agent':'idle');if(materialMoving)frame=requestAnimationFrame(tick);return;}
 const a=active;a.elapsed+=dt;const t=clamp(a.elapsed/a.duration);let drive=0,index=0,balance=0,lever=0;
 if(a.kind==='message'){drive=14.4*ease(t/.32);index=6*ease(t/.32);balance=Math.sin(t*Math.PI*2)*19;lever=balance*.35;}
 if(a.kind==='loading'){drive=24*t;index=6*t;balance=Math.sin(t*Math.PI*2)*9;}
 if(a.kind==='transition'){drive=18*ease(t);index=30*ease(t);lever=-12*Math.sin(t*Math.PI);balance=16*Math.sin(t*Math.PI*2)*(1-t*.5);}
 if(a.kind==='unfold'){drive=16*ease(t);index=9*ease(t);lever=-22*Math.sin(t*Math.PI);balance=14*Math.sin(t*Math.PI);}
 if(a.kind==='save'){const phase=t*3;drive=14.4*(Math.floor(phase)+ease((phase%1)/.6));index=12*ease(t);lever=-14*Math.sin(t*Math.PI*6)*(1-t);balance=12*Math.sin(t*Math.PI*6)*(1-t*.5);}
 if(a.kind==='denied'){drive=Math.sin(t*Math.PI*4)*6*(1-t);index=drive/3;lever=drive;balance=drive*1.8;}
 if(a.kind==='agent-open'){
  index=agentTopSpeed*agentWindDuration*t*t/2;drive=index*2.4;forwardDrive=drive;forwardIndex=index;
  balance=Math.sin(index*Math.PI/90)*14;lever=balance*.4;
  if(t>.2)friction.spin((t-.2)/.8,now);
 }
 if(a.kind==='agent-settle'){
  // Integrate velocity v*(1-t)^2: continuous speed at entry, then a gentle
  // finish with zero velocity and zero acceleration. Count this travel too.
  index=a.speed*a.duration*(1-(1-t)**3)/3;drive=index*2.4;
  forwardIndex=a.wound+index;forwardDrive=forwardIndex*2.4;
  balance=Math.sin(forwardIndex*Math.PI/90)*14*(1-t)**2;lever=balance*.4;
 }
 if(a.kind==='agent-close'){drive=-a.drive*ease(t);index=-a.index*ease(t);balance=-10*Math.sin(t*Math.PI*6)*(1-t);lever=balance*.4;}
 paint({drive:a.base.drive+drive,index:a.base.index+index,balance,lever});
 if(t===1){
  active=null;
  if(a.kind==='agent-open'){
   active={kind:'agent-settle',duration:agentSettleDuration,elapsed:0,base:{...position},speed:agentTopSpeed,wound:forwardIndex};
   label('agent-settle');
  }
  else if(a.kind==='agent-close')finishRewind();
  else label(agentPhase==='open'?'agent':waiting||'idle');
 }
 if(active||waiting||materialMoving)frame=requestAnimationFrame(tick);
}
// Only actual page movement following a reading gesture drives the clock.
// Restored positions, incoming content and programmatic jumps do not do so.
function intendScroll(duration=750){if(allowed()&&agentPhase==='closed')scrollIntentUntil=performance.now()+duration;}
addEventListener('wheel',event=>{if(!event.ctrlKey&&event.deltaY)intendScroll();},{passive:true});
for(const event of ['touchstart','touchmove','touchend'])addEventListener(event,()=>intendScroll(1200),{passive:true});
addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||!['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))return;
 if(event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=combobox],[role=slider]'))return;
 if(event.key===' '&&event.target.closest?.('button,summary,[role=button]'))return;
 intendScroll();
});
for(const event of ['pointerdown','pointermove'])addEventListener(event,e=>{
 if(e.pointerType==='mouse'&&e.buttons===1&&e.clientX>=document.documentElement.clientWidth-16)intendScroll(1200);
},{passive:true});
addEventListener('scroll',()=>{
 const now=performance.now(),top=Math.max(0,Math.min(scrollY,document.documentElement.scrollHeight-innerHeight)),distance=top-lastScrollTop;lastScrollTop=top;
 if(!allowed()||agentPhase!=='closed'||now>scrollIntentUntil||distance===0)return;
 scrollIntentUntil=Math.max(scrollIntentUntil,now+220);
 // Deliberate lesson feedback keeps priority over incidental scrolling.
 if(active&&!active.continuous&&active.kind!=='scroll')return;
 friction.feed(distance,now);
 // Integrate actual page travel, not wheel deltas or event counts. Native
 // touchpad inertia is already part of scrollY; there is no extra inertia.
 scrollTarget+=distance/scrollRadius*180/Math.PI*scrollMode.gain;scrollAt=now;
 if(active?.kind!=='scroll')active={kind:'scroll',elapsed:0,speed:0,phase:0,baseBalance:position.balance,baseLever:position.lever};
 label('scroll');wake();
},{passive:true});
addEventListener('resize',measureScroll,{passive:true});
addEventListener('blur',resetScroll);
document.addEventListener('mechanism:feedback',event=>feedback(event.detail.kind,event.detail.duration));
function playback(){
 waiting=agentPhase==='closed'&&document.body.dataset.appView==='read'?playbackKind:null;
 if(!waiting&&active?.continuous){active=null;paint({...position,balance:0,lever:0});}
 if(waiting&&!active){label(waiting);wake();}else if(!active)label(agentPhase==='open'?'agent':'idle');
}
document.addEventListener('unknowntalks:playback',event=>{playbackKind=event.detail.kind;playback();});
document.addEventListener('unknowntalks:view',event=>{
 if(event.detail.name==='agent'){
  // Reload / browser Forward also opens the native route, without inventing
  // a winding debt when there was no button animation in this page session.
  if(agentPhase==='opening')setAgentPhase('open');
  else if(agentPhase!=='open'){
   active=null;forwardDrive=forwardIndex=0;setAgentPhase('open');
  }
  label(active?.kind||'agent');
 }else if(agentPhase==='open'||agentPhase==='opening')rewindAgent();
 resetScroll({keepFriction:event.detail.name==='agent'&&['agent-open','agent-settle'].includes(active?.kind)});
 playback();
});
const saved=new WeakSet();
const messages=document.getElementById('messages');
if(messages)new MutationObserver(records=>{
 for(const record of records){const card=record.target;if(card.matches?.('.discovery-card.is-claimed')&&!saved.has(card)){saved.add(card);feedback('save',390);}}
}).observe(messages,{subtree:true,attributes:true,attributeFilter:['class']});
new MutationObserver(()=>{if(!allowed())stop();else playback();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else playback();});
addEventListener('pagehide',()=>stop(false));
paint(position);label('idle');
measureScroll();playback();
function availability(){host.disabled=!agentEnabled();if(!agentEnabled())rewindAgent();label(host.dataset.state||'idle');measureScroll();}
document.addEventListener('unknowntalks:preferences',availability);
new ResizeObserver(measureScroll).observe(host);
availability();
}
