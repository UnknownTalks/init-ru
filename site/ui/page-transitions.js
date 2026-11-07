// Native links and browser history stay in charge. This module only animates
// the rendered page, with a WAAPI fallback that cannot be disabled by the
// clock theme's CSS animation reset.
export function installPageTransitions({eligible,incoming,enabled,duration=()=>240,prepare=()=>{},restore=()=>{},state=()=>{}}){
 const root=document.documentElement;let target=null,arrival=null;
 const policy=document.createElement('style');policy.dataset.pageTransitionPolicy='';document.head.append(policy);
 function sync(){policy.textContent='@view-transition{navigation:'+(enabled()?'auto':'none')+'}';if(!enabled())arrival?.cancel();}
 sync();
 new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-motion']});
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',sync);
 const time=()=>Math.max(0,Math.min(800,Number(duration())||0));
 function startArrival(){
  if(!incoming()||!enabled()||!time())return;
  const content=document.getElementById('lesson-layout');if(!content)return;
  arrival?.cancel();root.dataset.pageTransition='arrival';state('arrival');
  arrival=content.animate([{opacity:0,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:time(),easing:'cubic-bezier(.2,0,.2,1)',fill:'none'});
  const animation=arrival;
  animation.finished.catch(()=>{}).finally(()=>{if(arrival===animation)arrival=null;});
 }
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
  const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
  const url=new URL(link.href,location.href);
  if(url.origin===location.origin&&url.pathname!==location.pathname&&eligible(url)){target=url.href;prepare(target);}
 },true);
 addEventListener('pageswap',event=>{
  const url=event.activation?.entry?.url||target;
  if(url&&eligible(new URL(url,location.href)))prepare(url);
  if(!enabled())event.viewTransition?.skipTransition();
 });
 function reveal(event){
  restore();root.style.setProperty('--page-transition-duration',time()+'ms');
  if(event?.viewTransition){
   if(!enabled()||!time()){event.viewTransition.skipTransition();return;}
   root.dataset.pageTransition='native';state('native');
  }else startArrival();
 }
 const native='onpagereveal' in window;
 addEventListener(native?'pagereveal':'pageshow',reveal);
 addEventListener('pagehide',()=>arrival?.cancel());
 root.dataset.pageFlow=native?'native':'arrival';
 return {cancel(){arrival?.cancel();},reveal,sync};
}
