export const preferenceKey='unknowntalks:interface:v1';
export const scales=[100,110,125,150,200];
let preferences={scale:100,agentEnabled:true};
export const interfaceScale=()=>preferences.scale/100;
export const agentEnabled=()=>preferences.agentEnabled;
function read(){
 try{const value=JSON.parse(localStorage.getItem(preferenceKey)||'{}');return {scale:scales.includes(value.scale)?value.scale:100,agentEnabled:value.agentEnabled!==false};}catch{return {...preferences};}
}
function layout(){
 const root=document.documentElement,width=root.getBoundingClientRect().width/interfaceScale();
 root.dataset.uiLayout=width<=760?'phone':width<=1100?'tablet':'desktop';
 root.dataset.uiDensity=width<280?'narrow':'normal';
}
function apply(){
 const root=document.documentElement;
 root.style.zoom=interfaceScale();root.dataset.interfaceScale=String(preferences.scale);
 root.dataset.agentEnabled=String(preferences.agentEnabled);layout();
 for(const button of document.querySelectorAll('button[data-interface-scale]'))button.setAttribute('aria-pressed',String(Number(button.dataset.interfaceScale)===preferences.scale));
 const toggle=document.getElementById('agent-enabled');if(toggle)toggle.checked=preferences.agentEnabled;
 document.dispatchEvent(new CustomEvent('unknowntalks:preferences',{detail:{...preferences}}));
}
export function initPreferences(){
 preferences=read();apply();
 document.addEventListener('click',event=>{
  const button=event.target.closest('button[data-interface-scale]');if(!button)return;
  const scale=Number(button.dataset.interfaceScale);if(!scales.includes(scale))return;
  preferences.scale=scale;save();
 });
 document.getElementById('agent-enabled')?.addEventListener('change',event=>{preferences.agentEnabled=event.target.checked;save();});
 addEventListener('resize',layout,{passive:true});
 addEventListener('storage',event=>{if(event.key===preferenceKey){preferences=read();apply();}});
 const toolbar=document.querySelector('.lesson-toolbar');
 if(toolbar)new ResizeObserver(()=>document.documentElement.style.setProperty('--mechanism-header-height',toolbar.offsetHeight+'px')).observe(toolbar);
 function save(){
  try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch{
   const status=document.getElementById('interface-status');if(status)status.textContent='Настройки действуют в этой вкладке. Сохранение в браузере недоступно.';
  }
  apply();
 }
}
