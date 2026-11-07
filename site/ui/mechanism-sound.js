// One licensed, quiet gear texture. The preference controls where it is heard.
export const soundModes=Object.freeze({off:'Без звука',watch:'Только взаимодействие с часами',actions:'Все действия без скролла',all:'Все действия со скроллом'});
export const soundAllowed=(mode,source)=>mode!=='off'&&(source==='watch'||mode==='all'||mode==='actions'&&source!=='scroll');
export function createWatchSound(getMode){
 let context=null,bank=null,ready=false,pending=null,epoch=0,previous=null,last=-Infinity,queued=null;
 const voices=new Set();
 const url=new URL('sound/gear-muted.wav',import.meta.url),segment=.024,count=12;
 function play(index,reverse=false,delay=0,level=1){
  if(!ready||document.hidden||context?.state!=='running'||voices.size>=8)return;
  const source=context.createBufferSource(),gain=context.createGain(),at=context.currentTime+delay;
  source.buffer=reverse?bank.reverse:bank.forward;gain.gain.setValueAtTime(.075*level,at);
  source.connect(gain);gain.connect(context.destination);voices.add(source);
  source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};
  source.start(at,((index%count)+count)%count*segment,segment);source.stop(at+segment+.002);
 }
 async function unlock(){
  if(getMode()==='off'||document.hidden)return false;
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
  context??=new Audio();const current=epoch;
  const resumed=context.resume();
  try{
   await resumed;
   if(!bank){
    if(!pending)pending=(async()=>{
     const response=await fetch(url);if(!response.ok)throw new Error('Audio unavailable');
     const forward=await context.decodeAudioData(await response.arrayBuffer());
     const reverse=context.createBuffer(forward.numberOfChannels,forward.length,forward.sampleRate);
     for(let ch=0;ch<forward.numberOfChannels;ch++)for(let i=0;i<count;i++){
      const start=Math.round(i*segment*forward.sampleRate),end=Math.round((i+1)*segment*forward.sampleRate);
      reverse.getChannelData(ch).set(forward.getChannelData(ch).slice(start,end).reverse(),start);
     }
     return {forward,reverse};
    })();
    bank=await pending;
   }
   if(current!==epoch||getMode()==='off'||document.hidden)return false;
   ready=context.state==='running';
   if(ready&&queued){const event=queued;queued=null;if(performance.now()-event.at<150)tap(event.source,event.amount);}
   return ready;
  }catch{pending=null;return false;}
 }
 function tap(source='watch',amount=2){
  if(!soundAllowed(getMode(),source)||document.hidden)return;
  if(!ready){queued={source,amount,at:performance.now()};return;}
  const now=performance.now();if(now-last<90)return;last=now;
  for(let i=0;i<Math.min(amount,3);i++)play(i,false,i*.032,.6-i*.1);
 }
 function motion(angle,velocity,now,{source='watch',activationAge=null}={}){
  const phase=angle/360*13,old=previous;previous={phase,now,source};
  if(!ready||!soundAllowed(getMode(),source)||Math.abs(velocity)<.5||!old||old.source!==source||now<=old.now||now-old.now>100)return;
  if(activationAge!==null&&activationAge>320)return;
  const direction=Math.sign(phase-old.phase);if(!direction)return;
  const first=direction>0?Math.floor(old.phase)+1:Math.ceil(old.phase)-1,end=direction>0?Math.floor(phase):Math.ceil(phase);
  const total=Math.max(0,(end-first)*direction+1),kept=Math.min(total,4);
  const fade=activationAge===null?1:Math.min(1,Math.max(0,(320-activationAge)/128));
  for(let i=0;i<kept;i++){
   const index=first+direction*Math.floor((i+.5)*total/kept),fraction=(index-old.phase)/(phase-old.phase),at=old.now+(now-old.now)*fraction;
   if(at-last<8)continue;last=at;
   play(index,direction<0,fraction*.006,fade*Math.min(1,Math.max(.25,Math.sqrt(Math.abs(velocity)/700))));
  }
 }
 function silence(suspend=false){
  previous=null;queued=null;
  for(const source of voices){try{source.stop();}catch{}}voices.clear();
  if(suspend){epoch++;ready=false;context?.suspend().catch(()=>{});}
 }
 function gesture(event){
  const target=event.target.closest?.('[data-lesson-mechanism]')?'watch':event.type==='wheel'?'scroll':'action';
  if(event.isTrusted&&soundAllowed(getMode(),target))void unlock();
 }
 for(const name of ['pointerdown','touchstart','keydown'])document.addEventListener(name,gesture,{capture:true,passive:true});
 document.addEventListener('unknowntalks:preferences',event=>{
  if(getMode()==='off')silence(true);
  else if(event.detail.userInitiated&&event.detail.changed==='soundMode')void unlock().then(ok=>{if(ok)tap('watch');});
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)silence(true);});
 addEventListener('pagehide',()=>silence(true));
 return {motion,tap,unlock,silence};
}
