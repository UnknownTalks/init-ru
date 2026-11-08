import {createMenuDrive,stepMenuDrive} from './menu-drive.js';
export function initMobileNavigation(){
 const root=document.documentElement,dialog=document.getElementById('mobile-navigation');
 const nav=document.querySelector('.lesson-tools'),button=document.querySelector('.mobile-menu-open');
 if(!dialog||!nav||!button)return;
 const sheet=dialog.querySelector('.mobile-menu-sheet'),heading=dialog.querySelector('.mobile-menu-heading');
 const slot=dialog.querySelector('.mobile-menu-content'),dock=document.querySelector('.mobile-menu-dock');
 const home=document.createComment('desktop navigation'),dockHome=document.createComment('instrument dock');nav.before(home);dock.before(dockHome);
 const drive=createMenuDrive();let frame=0,last=0,travel=0,drag=null,focusAfter=null,pendingItem=null,savedGutter=null;
 const mobile=()=>root.dataset.mobileHeader==='true';
 const animated=()=>root.dataset.motion!=='off';
 const scale=()=>Number(root.style.getPropertyValue('--interface-scale'))||1;
 const feedback=kind=>document.dispatchEvent(new CustomEvent('mechanism:feedback',{detail:{kind,source:'watch'}}));
 function paint(){
  const q=drive.position;dialog.style.setProperty('--menu-progress',q);
  sheet.style.transform=`translate3d(0,${(1-q)*travel}px,0)`;
  // Rack travel is reduced 8:1 before reaching the 30px / 24 tooth wheel.
  const angle=q*travel/30/8*180/Math.PI;
  dock.querySelector('.menu-gear-main').setAttribute('transform',`rotate(${angle})`);
  dock.querySelector('.menu-gear-middle').setAttribute('transform',`rotate(${-angle*24/14})`);
  dock.querySelector('.menu-gear-small').setAttribute('transform',`rotate(${angle*24/16})`);
  dock.style.setProperty('--menu-travel',q);
  dialog.dataset.menuPhase=drag?'held':drive.position===drive.target?(drive.target?'open':'closed'):(drive.target?'opening':'closing');
 }
 function measure(){if(!dialog.open)return;travel=sheet.offsetHeight+2;paint();}
 function release(){
  const gesture=drag;drag=null;
  if(gesture&&heading.hasPointerCapture(gesture.id))heading.releasePointerCapture(gesture.id);
 }
 function finish(){
  cancelAnimationFrame(frame);frame=0;release();drive.position=drive.velocity=drive.target=drive.accumulator=0;paint();
  pendingItem=null;delete root.dataset.menuOpen;if(savedGutter!==null){root.style.scrollbarGutter=savedGutter;savedGutter=null;}button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Открыть меню');
  if(dialog.open)dialog.close();
  if(dock.parentElement!==dockHome.parentElement)dockHome.after(dock);
  if(focusAfter){focusAfter.focus({preventScroll:true});focusAfter=null;}
 }
 function tick(now){
  frame=0;if(!animated()){drive.position=drive.target;drive.velocity=0;}
  const moving=animated()&&stepMenuDrive(drive,(now-last)/1000);last=now;paint();
  if(!moving&&!drag){
   if(!drive.target){const item=pendingItem;finish();if(item&&!document.hidden)item.click();}
   else if(document.activeElement===dialog)dialog.querySelector('#mobile-menu-title').focus({preventScroll:true});
   return;
  }
  if(!drag)frame=requestAnimationFrame(tick);
 }
 function wake(){
  if(!animated()){drive.position=drive.target;drive.velocity=0;paint();if(!drive.target){const item=pendingItem;finish();if(item)item.click();}return;}
  if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}
 }
 function close({focus=true,immediate=false,quiet=false,item=null}={}){
  if(!dialog.open)return;
  dialog.focus({preventScroll:true});
  release();pendingItem=item;focusAfter=focus?button:null;drive.target=0;root.dataset.menuOpen='closing';button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Открыть меню');
  if(!quiet)feedback('save');
  if(immediate){finish();return;}
  wake();
 }
 function open(){
  if(!mobile())return;
  release();pendingItem=null;focusAfter=null;drive.target=1;
  if(!dialog.open&&innerWidth-root.clientWidth>0){savedGutter=root.style.scrollbarGutter;root.style.scrollbarGutter='stable';}
  root.dataset.menuOpen='open';button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','Закрыть меню');
  if(!dialog.open){
   // Both initial position and scrim are set before the native top layer paints.
   drive.position=drive.velocity=0;dialog.style.setProperty('--menu-progress',0);
   sheet.style.transform='translate3d(0,var(--mobile-viewport-height,100dvh),0)';sheet.scrollTop=0;
   dialog.append(dock);dialog.showModal();dialog.focus({preventScroll:true});dialog.scrollTop=0;measure();
  }
  feedback('unfold');wake();
 }
 function sync(){
  if(mobile()){if(nav.parentElement!==slot)slot.append(nav);measure();}
  else {finish();if(nav.previousSibling!==home)home.after(nav);}
 }
 button.addEventListener('click',()=>dialog.open&&drive.target?close():open());
 dialog.querySelector('.mobile-menu-close').addEventListener('click',()=>close());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 dialog.addEventListener('click',event=>{
  const item=event.target.closest('[data-view-nav]');
  if(!dialog.open||!item||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();event.stopPropagation();close({focus:false,item});
 },true);
 heading.addEventListener('pointerdown',event=>{
  if(event.target.closest('button')||!event.isPrimary||event.button!==0)return;
  cancelAnimationFrame(frame);frame=0;pendingItem=null;
  drag={id:event.pointerId,y:event.clientY,base:drive.position,at:performance.now()};drive.velocity=0;
  heading.setPointerCapture(event.pointerId);
 });
 heading.addEventListener('pointermove',event=>{
  if(event.pointerId!==drag?.id)return;
  drive.position=Math.max(0,Math.min(1,drag.base-(event.clientY-drag.y)/scale()/Math.max(1,travel)));paint();
 });
 function end(event,cancel=false){
  if(event.pointerId!==drag?.id)return;const distance=(drag.base-drive.position)*travel*scale(),elapsed=performance.now()-drag.at;
  release();
  if(!cancel&&(distance>80||distance>24&&distance/elapsed>.6))close();else{drive.target=1;wake();}
 }
 heading.addEventListener('pointerup',event=>end(event));heading.addEventListener('pointercancel',event=>end(event,true));heading.addEventListener('lostpointercapture',event=>{if(drag)end(event,true);});
 addEventListener('pagehide',finish);addEventListener('pageshow',()=>{if(!dialog.open)finish();});
 addEventListener('popstate',()=>close({quiet:true}));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();});
 document.addEventListener('unknowntalks:viewport',measure);
 new ResizeObserver(()=>{if(dialog.open)requestAnimationFrame(measure);}).observe(sheet);
 new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-mobile-header']});
 sync();
}
