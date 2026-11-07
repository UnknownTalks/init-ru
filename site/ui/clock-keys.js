export function initClockKeys(pool) {
 const raised='.knowledge-card-action,.chapter-navigation,.reply-send,.conversation-action,.lesson-tools > [data-view-nav],.skill-summary,#restart-chat,#rollback-confirm,#rollback-cancel';
 const controls='#lesson-layout button,#lesson-layout summary,#lesson-layout a.chapter-navigation,.lesson-tools > [data-view-nav],.choice-trigger,.ui-radio,.ui-checkbox,.reading-options label,.reply-fieldset label';
 const records=new Map(),active=new Set();let frame=0,held=null;
 const base=()=>0;
 // Navigation and disclosures provide their own feedback. Do not make them
 // wait for a decorative press/release cycle before moving their content.
 const contentControl=r=>r.el.matches('[data-view-nav],summary,.thread-toggle,.agent-thread-toggle,.agent-thread-close');
 function paint(r){
  r.el.style.setProperty('--clock-y',r.depth.toFixed(3)+'px');
 }
 function kind(r){
  r.el.dataset.clockKey=r.el.matches('[aria-current=page]')||r.el.matches('.knowledge-card:not(.is-claimed) .knowledge-card-action')?'ivory':'dark';
 }
 function travel(t){const ramp=.18,rate=1/(1-ramp);return t<ramp?rate*t*t/(2*ramp):t>1-ramp?1-rate*(1-t)*(1-t)/(2*ramp):rate*(t-ramp/2);}
 function stroke(r,phase,to,start=performance.now()){
  r.motion={phase,from:r.depth,to,start,duration:pool.duration(phase)*Math.max(.45,Math.abs(to-r.depth))};
 }
 function done(r){const finish=r.resolve;r.resolve=null;if(finish&&!r.signal?.aborted)pool.end();finish?.();}
 function step(now){
  frame=0;
  for(const r of active){
   if(!pool.visible(r.el)){active.delete(r);r.motion=null;r.depth=base(r);paint(r);done(r);continue;}
   const m=r.motion;if(!m){active.delete(r);done(r);continue;}
   const t=Math.max(0,Math.min(1,(now-m.start)/m.duration));r.depth=m.from+(m.to-m.from)*travel(t);paint(r);
   if(t===1){
    r.motion=null;
    if(m.phase==='press'&&!r.down){pool.end();stroke(r,'release',base(r),now+pool.gap);}
    else {active.delete(r);done(r);}
   }
  }
  if(active.size)frame=requestAnimationFrame(step);
 }
 function wake(r,cancelStroke=false){
  if(!pool.enabled()){r.ticket?.cancel();r.motion=null;r.depth=base(r);paint(r);return;}
  if(r.down){if(r.depth===1)return;if(r.motion?.phase!=='press')stroke(r,'press',1);}
  else if(cancelStroke||r.motion?.phase!=='press'){
   if(Math.abs(r.depth-base(r))<.001){r.motion=null;active.delete(r);done(r);paint(r);return;}
   if(r.motion?.phase!=='release'||r.motion.to!==base(r))stroke(r,'release',base(r));
  }
  if(!r.motion||r.ticket)return;
  const clean=()=>{active.delete(r);r.ticket=null;r.motion=null;r.depth=r.down?1:base(r);paint(r);done(r);};
  r.ticket=pool.enqueue({key:r.el,valid:()=>pool.visible(r.el),run:async signal=>{
   if(!await pool.begin(signal))return;
   await new Promise(resolve=>{
    r.resolve=resolve;r.signal=signal;
    if(!r.motion){done(r);return;}
    r.motion.start=performance.now();r.motion.duration=pool.duration(r.motion.phase)*Math.max(.45,Math.abs(r.motion.to-r.motion.from));
    active.add(r);if(!frame)frame=requestAnimationFrame(step);
   });
  },finish:clean,cancel:clean});
 }
 function decorate(node){
  if(!(node instanceof Element))return;
  for(const el of [...(node.matches(controls)?[node]:[]),...node.querySelectorAll(controls)]){
   if(el.closest('[hidden],[data-ui-sources]'))continue;
   let r=records.get(el);
   if(!r){r={el,raised:el.matches(raised),depth:0,down:false,ticket:null,motion:null,resolve:null};records.set(el,r);}
   if(!el.classList.contains('clock-press'))el.classList.add('clock-press');
   if(r.raised&&!el.querySelector(':scope > .clock-face')){
    const face=document.createElement('span'),label=document.createElement('span');face.className='clock-face';label.className='clock-label';
    label.append(...el.childNodes);face.append(label);el.append(face);el.classList.add('clock-key');
    el.classList.toggle('clock-key--tab',el.matches('[data-view-nav]'));el.classList.toggle('clock-key--summary',el.matches('.skill-summary'));
   }
   kind(r);if(!r.ticket&&!r.down){r.depth=base(r);paint(r);}
  }
  for(const [el,r] of records)if(!el.isConnected){r.ticket?.cancel();records.delete(el);}
 }
 function release(cancel=false){if(!held)return;const r=held.record;held=null;r.down=false;wake(r,cancel);}
 document.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0)return;release();
  const r=records.get(event.target.closest('.clock-press'));if(!r||contentControl(r)||r.el.matches(':disabled,[aria-disabled=true]'))return;
  r.down=true;held={record:r,id:event.pointerId,type:event.pointerType,x:event.clientX,y:event.clientY};wake(r);
 },{capture:true,passive:true});
 document.addEventListener('pointermove',event=>{
  if(!held||event.pointerId!==held.id)return;
  if(held.type==='touch'&&Math.hypot(event.clientX-held.x,event.clientY-held.y)>12)release(true);
 },{passive:true});
 document.addEventListener('pointerup',event=>{if(event.pointerId===held?.id)release();},{passive:true});
 document.addEventListener('pointercancel',event=>{if(event.pointerId===held?.id)release(true);},{passive:true});
 document.addEventListener('keydown',event=>{
  if(event.repeat||![' ','Enter'].includes(event.key))return;
  const r=records.get(event.target.closest('.clock-press'));if(!r||contentControl(r)||r.el.matches(':disabled,[aria-disabled=true]')||event.key===' '&&r.el.matches('a'))return;
  release();r.down=true;held={record:r,type:'keyboard'};wake(r);
 },true);
 document.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)&&held?.type==='keyboard')release();});
 document.addEventListener('focusout',event=>{if(held?.record.el===event.target)release(true);});
 addEventListener('blur',()=>release(true));document.documentElement.addEventListener('pointerleave',()=>{if(held?.type==='mouse')release(true);});
 addEventListener('pagehide',()=>release(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)release(true);});
 pool.subscribe(on=>{if(!on){held=null;for(const r of records.values()){r.down=false;r.depth=base(r);paint(r);}}});
 decorate(document.body);
 new MutationObserver(changes=>{
  const nodes=new Set();
  for(const change of changes){
   if(change.type==='childList'){if(change.target.matches?.(controls))nodes.add(change.target);for(const node of change.addedNodes)if(node instanceof Element)nodes.add(node);}
   else nodes.add(change.target);
  }
  for(const node of nodes)decorate(node);
 }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current','open','hidden','class']});
}
