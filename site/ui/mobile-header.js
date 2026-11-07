// Fixed elements already follow Safari's visible viewport. Adding offsetTop
// double-counts elastic overscroll and can leave the header displaced.
export function installMobileHeader(scale){
 const root=document.documentElement,viewport=window.visualViewport;let frame=0;
 function sync(){
  frame=0;
  // Only the lower controls need the browser/keyboard occlusion, never the
  // temporary positive/negative offset produced by rubber-band scrolling.
  const bottom=viewport&&viewport.scale<=1.01?Math.max(0,innerHeight-viewport.height-Math.max(0,viewport.offsetTop)):0;
  root.style.setProperty('--mobile-viewport-bottom',bottom/scale()+'px');
  root.style.setProperty('--mobile-viewport-height',(viewport?.height||innerHeight)/scale()+'px');
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(sync);}
 viewport?.addEventListener('resize',schedule,{passive:true});
 addEventListener('resize',schedule,{passive:true});addEventListener('orientationchange',schedule,{passive:true});addEventListener('pageshow',schedule);
 document.addEventListener('unknowntalks:preferences',schedule);sync();
}
