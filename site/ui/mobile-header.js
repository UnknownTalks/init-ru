// Use one visual viewport for header, modal and lower control. Native fixed
// layers on iOS can follow a different viewport while browser chrome changes.
export function mobileViewport({width,height,top=0,left=0,visualScale=1,scroll=0,maxScroll=Infinity},interfaceScale=1){
 const elastic=scroll<0||scroll>maxScroll+1,pinched=visualScale>1.01;
 const y=elastic||pinched?0:Math.max(0,top),x=pinched?0:Math.max(0,left);
 return {top:y/interfaceScale,left:x/interfaceScale,width:width/interfaceScale,height:height/interfaceScale};
}
export function installMobileHeader(scale){
 const root=document.documentElement,viewport=window.visualViewport;let frame=0;
 function sync(){
  frame=0;
  const pinched=viewport?.scale>1.01;
  const box=mobileViewport({width:pinched?innerWidth:viewport?.width||innerWidth,height:pinched?innerHeight:viewport?.height||innerHeight,
   top:viewport?.offsetTop||0,left:viewport?.offsetLeft||0,visualScale:viewport?.scale||1,scroll:scrollY,
   maxScroll:Math.max(0,root.scrollHeight-root.clientHeight)},scale());
  for(const key of ['top','left','width','height'])root.style.setProperty('--mobile-viewport-'+key,box[key]+'px');
  root.style.setProperty('--mobile-viewport-bottom',Math.max(0,innerHeight/scale()-box.top-box.height)+'px');
  document.dispatchEvent(new CustomEvent('unknowntalks:viewport'));
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(sync);}
 for(const event of ['resize','scroll'])viewport?.addEventListener(event,schedule,{passive:true});
 for(const event of ['resize','scroll','orientationchange','pageshow','touchend','touchcancel'])addEventListener(event,schedule,{passive:true});
 document.addEventListener('unknowntalks:preferences',schedule);sync();
}
