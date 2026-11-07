// Older WebKit reports rectangles before CSS zoom; current CSSOM reports
// viewport pixels. Detect the behavior, rather than guessing from a user agent.
let legacy;
function legacyZoom(){
 if(legacy!==undefined)return legacy;
 const probe=document.createElement('span');
 probe.style.cssText='position:fixed;left:-1000px;top:0;width:10px;height:1px;zoom:2;pointer-events:none';
 document.documentElement.append(probe);legacy=probe.getBoundingClientRect().width<15;probe.remove();
 document.documentElement.dataset.zoomGeometry=legacy?'legacy':'viewport';return legacy;
}
function normalizeRect(element,rect){
 if(!legacyZoom())return rect;
 let zoom=1,fixed=false;
 for(let node=element;node;node=node.parentElement){
  const style=getComputedStyle(node),value=parseFloat(style.zoom);if(value>0)zoom*=value;
  if(style.position==='fixed')fixed=true;
  if(style.position==='sticky'&&Element.prototype.getBoundingClientRect.call(node).top<= (parseFloat(style.top)||0)+1)fixed=true;
 }
 // Legacy WebKit subtracts the unscaled window scroll from a pre-zoom
 // document position. Scale that position, then subtract scroll only once.
 const x=rect.x*zoom+(fixed?0:scrollX*(zoom-1));
 const y=rect.y*zoom+(fixed?0:scrollY*(zoom-1));
 return new DOMRect(x,y,rect.width*zoom,rect.height*zoom);
}
export function viewportRect(element){return normalizeRect(element,Element.prototype.getBoundingClientRect.call(element));}
export function viewportRangeRect(range){
 const node=range.commonAncestorContainer,element=node.nodeType===1?node:node.parentElement;
 return normalizeRect(element,range.getBoundingClientRect());
}
export function normalizeSelectReference(element){
 // Floating UI expects a physical viewport rectangle. This local reference
 // shim leaves the browser's native layout, events and every other node alone.
 if(element&&legacyZoom())element.getBoundingClientRect=()=>viewportRect(element);
}
