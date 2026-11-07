// One clock for interface feedback. Lesson state never belongs to this queue.
export function createMotion() {
 const root=document.documentElement,media=matchMedia('(prefers-reduced-motion: reduce)');
 const storageKey='unknowntalks:motion:v1',choices=['system','clock','off'];
 let preference='system';
 try { const saved=localStorage.getItem(storageKey);if(choices.includes(saved))preference=saved; } catch {}
 const url=new URL(location.href),requested=url.searchParams.get('motion');
 if(choices.includes(requested)){
  preference=requested;try{localStorage.setItem(storageKey,preference);}catch{}
  url.searchParams.delete('motion');history.replaceState(history.state,'',url);
 }
 const enabled=()=>preference==='clock'||preference==='system'&&!media.matches;
 const timings={press:135,release:135,fold:337.5,exit:135,enter:165,panel:337.5,message:135};
 const duration=kind=>timings[kind]??timings.panel,gap=75,easing='cubic-bezier(.35,0,.3,1)';
 const pending=[],listeners=new Set();let current=null,scheduled=false,notBefore=0;
 const visible=element=>element.isConnected&&element.getClientRects().length>0;
 function notify(){for(const fn of listeners)fn(enabled());}
 function settle(job,complete){
  if(job.settled)return;job.settled=true;job.controller.abort();
  try{if(complete&&job.valid())job.finish?.();else job.cancel?.();}finally{job.resolve();}
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;pump();});}}
 function pump(){
  if(current)return;
  while(pending.length){
   const job=pending.shift();
   if(!job.valid()){settle(job,false);continue;}
   if(!enabled()||document.hidden){settle(job,true);continue;}
   current=job;
   Promise.resolve().then(()=>job.settled?undefined:job.run(job.controller.signal)).catch(error=>{
    if(error?.name!=='AbortError')console.error('Interface motion:',error);
   }).finally(()=>{if(current!==job)return;current=null;settle(job,true);schedule();});return;
  }
 }
 function enqueue({key,label,run,finish,cancel,valid=()=>true}){
  const previous=pending.findIndex(job=>job.key===key);
  if(previous!==-1)settle(pending.splice(previous,1)[0],false);
  const job={key,label,run,finish,cancel,valid,controller:new AbortController(),settled:false};
  const finished=new Promise(resolve=>{job.resolve=resolve;});pending.push(job);schedule();
  return {finished,cancel(complete=false){
   const i=pending.indexOf(job);if(i!==-1)pending.splice(i,1);if(current===job)current=null;
   settle(job,complete);schedule();
  }};
 }
 function flush(){const jobs=[...(current?[current]:[]),...pending];current=null;pending.length=0;notBefore=0;for(const job of jobs)settle(job,true);}
 async function begin(signal){
  if(signal.aborted||!enabled()||document.hidden)return false;
  const delay=notBefore-performance.now();
  if(delay>0)await new Promise(resolve=>{
   const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
   const timer=setTimeout(done,delay);signal.addEventListener('abort',done,{once:true});
  });
  return !signal.aborted&&enabled()&&!document.hidden;
 }
 const end=()=>{notBefore=performance.now()+gap;};
 async function play(element,frames,{kind='panel',hold=false,...options}={},signal){
  if(!await begin(signal))return null;
  const animation=element.animate(frames,{fill:'both',...options,easing,duration:duration(kind)});
  // The watch reacts when the queued movement actually starts, rather than
  // racing ahead on the click that requested it.
  const feedback=element.matches('.timeline-jump[aria-disabled=true]')?'denied'
   :element.matches('details,.thread-content,.quiz-body,.lesson-agent-thread')?'unfold'
   :element.matches('.lesson-tools,#reader-frame,#final-check-body,#lesson-reader,.app-view')?'transition':null;
  if(feedback)document.dispatchEvent(new CustomEvent('mechanism:feedback',{detail:{kind:feedback,duration:duration(kind)}}));
  const stop=()=>animation.cancel();signal.addEventListener('abort',stop,{once:true});
  try{await animation.finished;}catch(error){if(error?.name!=='AbortError')throw error;}
  finally{signal.removeEventListener('abort',stop);if(!hold||signal.aborted)animation.cancel();if(!signal.aborted)end();}
  return animation;
 }
 // WAAPI-compatible handle for the player. A finished frame can remain held
 // until its owner has replaced the content and restored the reading anchor.
 function frame(element,frames,{kind='panel',key=element,valid=()=>visible(element),...options}={}){
  let animation;
  const ticket=enqueue({key,valid,run:async signal=>{animation=await play(element,frames,{kind,fill:'none',...options,hold:true},signal);},cancel:()=>animation?.cancel()});
  return {finished:ticket.finished,cancel(){animation?.cancel();ticket.cancel();}};
 }
 function sync(){
  root.dataset.motion=enabled()?'clock':'off';
  const control=document.getElementById('motion-mode');if(control)control.value=preference;
  if(!enabled())flush();notify();
 }
 const control=document.getElementById('motion-mode');
 control?.addEventListener('change',()=>{preference=choices.includes(control.value)?control.value:'system';try{localStorage.setItem(storageKey,preference);}catch{}sync();});
 media.addEventListener('change',sync);
 addEventListener('storage',event=>{if(event.key===storageKey){preference=choices.includes(event.newValue)?event.newValue:'system';sync();}});
 addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
 sync();
 return {enqueue,play,frame,flush,begin,end,duration,gap,easing,enabled,visible,
  subscribe(fn){listeners.add(fn);fn(enabled());return()=>listeners.delete(fn);}};
}
