import {interfaceScale} from './preferences.js';
// The same ivory surface follows the active lesson tab. Its position also
// clips the label ink, so text stays dark wherever the surface passes beneath it.
function initTabSurface(pool) {
 const nav=document.querySelector('.lesson-tools');if(!nav)return null;
 const tabs=[...nav.querySelectorAll('[data-view-nav]')];
 const surface=document.createElement('span');surface.className='clock-tab-surface';surface.setAttribute('aria-hidden','true');
 nav.prepend(surface);nav.dataset.clockTabs='';let moving=null;
 const active=()=>tabs.find(tab=>tab.getAttribute('aria-current')==='page');
 const set=(name,value)=>nav.style.setProperty('--clock-tab-'+name,value+'px');
 function measure(tab){
  const bounds=nav.getBoundingClientRect(),scale=interfaceScale();
  for(const item of tabs){const label=item.querySelector('.clock-label');if(label)item.style.setProperty('--clock-label-x',((label.getBoundingClientRect().left-bounds.left)/scale)+'px');}
  if(!tab||!pool.visible(tab))return null;
  const rect=tab.getBoundingClientRect();return {x:(rect.left-bounds.left)/scale,y:(rect.top-bounds.top)/scale,width:rect.width/scale,height:rect.height/scale};
 }
 function place(rect){
  surface.hidden=!rect;set('width',rect?.width||0);
  if(rect){set('x',rect.x);set('y',rect.y);surface.style.height=rect.height+'px';}
 }
 function sync(){if(!moving||moving.signal.aborted)place(measure(active()));}
 async function move(name,signal){
  const target=tabs.find(tab=>tab.dataset.viewNav===(name==='skill'?'skills':name)),rect=measure(target);
  if(!rect||surface.hidden)return false;
  const style=getComputedStyle(nav),x=style.getPropertyValue('--clock-tab-x'),y=style.getPropertyValue('--clock-tab-y'),width=style.getPropertyValue('--clock-tab-width');
  if(Math.abs(parseFloat(x)-rect.x)<.5&&Math.abs(parseFloat(y)-rect.y)<.5&&Math.abs(parseFloat(width)-rect.width)<.5)return false;
  const job=moving={signal};
  // A rapid second selection continues from the surface's current position.
  const freeze=()=>{const current=getComputedStyle(nav);for(const key of ['x','y','width'])nav.style.setProperty('--clock-tab-'+key,current.getPropertyValue('--clock-tab-'+key));};
  signal.addEventListener('abort',freeze,{once:true});
  try{
   const animation=await pool.play(nav,[{'--clock-tab-x':x,'--clock-tab-y':y,'--clock-tab-width':width},{'--clock-tab-x':rect.x+'px','--clock-tab-y':rect.y+'px','--clock-tab-width':rect.width+'px'}],{kind:'exit',hold:true},signal);
   if(!signal.aborted){place(rect);animation?.cancel();}
  }finally{signal.removeEventListener('abort',freeze);if(moving===job)moving=null;}
  return true;
 }
 const resize=new ResizeObserver(sync);resize.observe(nav);for(const tab of tabs)resize.observe(tab);
 // Player updates can replace a button's label without changing its size.
 new MutationObserver(sync).observe(nav,{childList:true,subtree:true,characterData:true});
 document.addEventListener('unknowntalks:view',sync);document.fonts.ready.then(sync);sync();
 return {move};
}

export function initClockLayout(pool) {
 const tabs=initTabSurface(pool);
 const root=document.documentElement;
 if(root.hasAttribute('data-lesson-entry')){
  const entering=[...document.querySelectorAll('.lesson-tools > :is([data-view-nav=chapters],[data-view-nav=skills])')],animations=[];
  const finish=()=>{root.removeAttribute('data-lesson-entry');for(const animation of animations)animation?.cancel();};
  pool.enqueue({key:'lesson-menu-entry',valid:()=>entering.every(tab=>pool.visible(tab)),run:async signal=>{
   for(const tab of entering){
    if(signal.aborted)return;
    animations.push(await pool.play(tab,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{kind:'enter',hold:true},signal));
   }
  },finish,cancel:finish});
 }
 const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 const folds=new WeakMap();
 document.addEventListener('click',event=>{
  const summary=event.target.closest('#lesson-layout details > summary');
  if(!summary||event.defaultPrevented||event.button!==0)return;
  event.preventDefault();const details=summary.parentElement;
  let state=folds.get(details);if(!state){state={wanted:details.open};folds.set(details,state);}
  const open=state.wanted=!state.wanted;
  const clean=()=>{details.style.height='';details.style.overflow='';};
  pool.enqueue({key:details,valid:()=>pool.visible(details),run:async signal=>{
   if(details.open===open)return;
   const scale=interfaceScale(),from=details.getBoundingClientRect().height/scale;details.style.height=from+'px';details.style.overflow='clip';
   try{
    if(open){details.open=true;await nextFrame();if(signal.aborted)return;}
    details.style.height='';const full=details.getBoundingClientRect().height/scale,style=getComputedStyle(details);
    const to=open?full:summary.getBoundingClientRect().height/scale+['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((n,p)=>n+parseFloat(style[p]||0),0);
    details.style.height=from+'px';
    await pool.play(details,[{height:from+'px'},{height:to+'px'}],{kind:'fold'},signal);
    if(!signal.aborted)details.open=open;
   }finally{clean();}
  },finish:()=>{details.open=open;clean();},cancel:()=>{clean();state.wanted=details.open;}});
  state.wanted=open;
 });
 const section=name=>name==='read'?document.getElementById('lesson-reader'):document.querySelector('#secondary-views > :not([hidden])');
 const clean=element=>{if(element){element.style.opacity='';element.style.transform='';}};
 function transition({from,to,commit,complete,valid}){
  let outgoing=section(from),incoming,committed=false;
  const apply=()=>{if(!committed){committed=true;commit();incoming=section(to);}};
  const clear=()=>{clean(outgoing);clean(incoming);};
  return pool.enqueue({key:'lesson-route',valid,run:async signal=>{
   // Tab travel takes the outgoing fade's place, keeping the existing total
   // transition time and the single-animation queue.
   const moved=await tabs?.move(to,signal);if(signal.aborted)return;
   if(!moved&&outgoing&&pool.visible(outgoing)){
    await pool.play(outgoing,[{opacity:1},{opacity:0}],{kind:'exit'},signal);
    if(signal.aborted)return;outgoing.style.opacity='0';
   }
   apply();
   if(incoming&&pool.visible(incoming)){
    incoming.style.opacity='0';
    await pool.play(incoming,[{opacity:0},{opacity:1}],{kind:'enter'},signal);
   }
  },finish:()=>{apply();clear();complete();},cancel:clear});
 }
 // Radix keeps ownership of selection, focus and dismissal.
 const seen=new WeakSet();
 new MutationObserver(()=>{
  for(const popup of document.querySelectorAll('[data-slot=select-content]')){
   if(seen.has(popup))continue;seen.add(popup);popup.style.opacity='0';
   const clean=()=>{popup.style.opacity='';};
   pool.enqueue({key:popup,valid:()=>pool.visible(popup),run:signal=>pool.play(popup,[{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],{kind:'enter'},signal),finish:clean,cancel:clean});
  }
 }).observe(document.body,{childList:true,subtree:true});
 return {transition};
}
