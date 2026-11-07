// Keep the instrument inside Safari's visible viewport, including browser chrome
// changes. Never move the document scroll position to correct the header.
export function installMobileHeader(scale){
 const root=document.documentElement,viewport=window.visualViewport;let frame=0;
 function sync(){frame=0;const mobile=root.dataset.mobileHeader==='true';
  const offset=mobile&&viewport&&viewport.scale<=1.01?Math.max(0,viewport.offsetTop):0;
  root.style.setProperty('--toolbar-viewport-top',offset/scale()+'px');
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(sync);}
 viewport?.addEventListener('resize',schedule,{passive:true});viewport?.addEventListener('scroll',schedule,{passive:true});
 addEventListener('resize',schedule,{passive:true});addEventListener('orientationchange',schedule,{passive:true});addEventListener('pageshow',schedule);
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-ui-layout','data-interface-scale','data-mobile-header']});sync();
}
