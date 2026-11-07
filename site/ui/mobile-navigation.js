export function initMobileNavigation(){
 const root=document.documentElement,dialog=document.getElementById('mobile-navigation');
 const nav=document.querySelector('.lesson-tools'),button=document.querySelector('.mobile-menu-open');
 if(!dialog||!nav||!button)return;
 const sheet=dialog.querySelector('.mobile-menu-sheet'),heading=dialog.querySelector('.mobile-menu-heading');
 const slot=dialog.querySelector('.mobile-menu-content'),home=document.createComment('desktop navigation');nav.before(home);
 let animation=null,scrim=null,revision=0,wanted=false,drag=null,focusAfter=null;
 const mobile=()=>root.dataset.mobileHeader==='true';
 const animate=()=>root.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 function feedback(kind){document.dispatchEvent(new CustomEvent('mechanism:feedback',{detail:{kind,source:'watch'}}));}
 function clear(){animation?.cancel();scrim?.cancel();animation=scrim=null;sheet.style.transform='';}
 function finish(){
  const active=dialog.open||wanted||root.hasAttribute('data-menu-open');wanted=false;clear();
  if(dialog.open)dialog.close();
  if(active){delete root.dataset.menuOpen;button.setAttribute('aria-expanded','false');}
  if(focusAfter){focusAfter.focus({preventScroll:true});focusAfter=null;}
 }
 async function close({focus=true,immediate=false,quiet=false}={}){
  if(!dialog.open)return false;
  const token=++revision;wanted=false;root.dataset.menuOpen='closing';button.setAttribute('aria-expanded','false');
  focusAfter=focus?button:null;
  const y=new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;clear();if(!quiet)feedback('save');
  if(animate()&&!immediate){
   const from=Math.max(0,y);
   animation=sheet.animate([{transform:`translateY(${Number.isFinite(from)?from:0}px)`},{transform:'translateY(105%)'}],{duration:240,easing:'cubic-bezier(.4,0,1,1)',fill:'both'});
   scrim=dialog.animate([{backgroundColor:'#0007'},{backgroundColor:'#0000'}],{duration:240,fill:'both'});
   await animation.finished.catch(()=>{});
  }
  if(token!==revision)return false;
  finish();return true;
 }
 function open(){
  if(!mobile()||wanted)return;
  ++revision;wanted=true;clear();root.dataset.menuOpen='open';button.setAttribute('aria-expanded','true');
  if(!dialog.open)dialog.showModal();dialog.querySelector('#mobile-menu-title').focus({preventScroll:true});feedback('unfold');
  if(animate()){
   animation=sheet.animate([{transform:'translateY(105%)'},{transform:'translateY(0)'}],{duration:360,easing:'cubic-bezier(.16,1,.3,1)',fill:'none'});
   scrim=dialog.animate([{backgroundColor:'#0000'},{backgroundColor:'#0007'}],{duration:260,fill:'none'});
  }
 }
 function sync(){
  if(mobile()){if(nav.parentElement!==slot)slot.append(nav);}
  else {++revision;finish();home.after(nav);}
 }
 button.addEventListener('click',()=>wanted?close():open());
 dialog.querySelector('.mobile-menu-close').addEventListener('click',()=>close());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 dialog.addEventListener('click',event=>{
  const item=event.target.closest('[data-view-nav]');
  if(!dialog.open||!item||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  // Release native modal focus/inertness before the route focuses its heading.
  event.preventDefault();event.stopPropagation();
  close({focus:false}).then(closed=>{if(closed&&!document.hidden&&!dialog.open)item.click();});
 },true);
 // Capture only the handle/header. Touches in the navigation retain native
 // taps and scrolling. A cancelled gesture always returns to an operable menu.
 heading.addEventListener('pointerdown',event=>{
  if(event.target.closest('button')||!event.isPrimary||event.button!==0)return;
  clear();drag={id:event.pointerId,y:event.clientY,at:performance.now(),distance:0};heading.setPointerCapture(event.pointerId);
 });
 heading.addEventListener('pointermove',event=>{if(event.pointerId!==drag?.id)return;drag.distance=Math.max(0,event.clientY-drag.y);sheet.style.transform=`translateY(${drag.distance/(Number(root.style.getPropertyValue('--interface-scale'))||1)}px)`;});
 function end(event,cancel=false){
  if(event.pointerId!==drag?.id)return;const gesture=drag;drag=null;
  if(heading.hasPointerCapture(gesture.id))heading.releasePointerCapture(gesture.id);
  if(!cancel&&(gesture.distance>80||gesture.distance>24&&gesture.distance/(performance.now()-gesture.at)>.6))close();
  else {const from=sheet.style.transform;sheet.style.transform='';if(animate())animation=sheet.animate([{transform:from},{transform:'translateY(0)'}],{duration:180,easing:'ease-out'});}
 }
 heading.addEventListener('pointerup',event=>end(event));heading.addEventListener('pointercancel',event=>end(event,true));heading.addEventListener('lostpointercapture',event=>{if(drag)end(event,true);});
 // bfcache snapshots and changed layouts must never carry an invisible modal.
 addEventListener('pagehide',()=>{++revision;finish();});
 addEventListener('pageshow',()=>{if(!wanted&&dialog.open)finish();});
 addEventListener('popstate',()=>close({immediate:true,quiet:true}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden){++revision;finish();}});
 new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-mobile-header']});
 sync();
}
