import {resolveInterfacePreference} from './interface-preference.js';
import {installMobileHeader} from './mobile-header.js';
import {soundModes} from './mechanism-sound.js';
export const preferenceKey='unknowntalks:interface:v1';
export const scales=[100,110,125,150,200];
let preferences={scale:125,desktopScale:125,mobileScale:100,agentEnabled:true,soundMode:'off'};
export const soundMode=()=>preferences.soundMode;
export const interfaceScale=()=>preferences.scale/100;
export const agentEnabled=()=>preferences.agentEnabled;
function read(){
 try{const value=JSON.parse(localStorage.getItem(preferenceKey)||'{}');return {...resolveInterfacePreference(value||{}),agentEnabled:value?.agentEnabled!==false,soundMode:Object.hasOwn(soundModes,value?.soundMode)?value.soundMode:'off'};}catch{return {...preferences,...resolveInterfacePreference()};}
}
function layout(){
 const root=document.documentElement,width=innerWidth/interfaceScale();
 root.dataset.uiLayout=width<=760?'phone':width<=1100?'tablet':'desktop';
 root.dataset.uiDensity=width<280?'narrow':'normal';
 root.dataset.mobileHeader=String(resolveInterfacePreference(preferences).mobile);
}
function apply(userInitiated=false,changed=null){
 const root=document.documentElement;
 root.style.setProperty('--interface-scale',interfaceScale());root.dataset.interfaceScale=String(preferences.scale);
 root.dataset.agentEnabled=String(preferences.agentEnabled);layout();
 for(const button of document.querySelectorAll('button[data-interface-scale]'))button.setAttribute('aria-pressed',String(Number(button.dataset.interfaceScale)===preferences.scale));
 const toggle=document.getElementById('agent-enabled');if(toggle)toggle.checked=preferences.agentEnabled;
 const sound=document.getElementById('mechanism-sound-mode');if(sound)sound.value=preferences.soundMode;
 document.dispatchEvent(new CustomEvent('unknowntalks:preferences',{detail:{...preferences,userInitiated,changed}}));
}
export function initPreferences(){
 preferences=read();apply();installMobileHeader(interfaceScale);
 document.addEventListener('click',event=>{
  const button=event.target.closest('button[data-interface-scale]');if(!button)return;
  const scale=Number(button.dataset.interfaceScale);if(!scales.includes(scale))return;
  const key=resolveInterfacePreference(preferences).mobile?'mobileScale':'desktopScale';
  preferences[key]=preferences.scale=scale;save('scale');
 });
 document.getElementById('mechanism-sound-mode')?.addEventListener('change',event=>{if(Object.hasOwn(soundModes,event.target.value)){preferences.soundMode=event.target.value;save('soundMode');}});
 document.getElementById('agent-enabled')?.addEventListener('change',event=>{preferences.agentEnabled=event.target.checked;save('agentEnabled');});
 addEventListener('resize',()=>{const next=resolveInterfacePreference(preferences);if(next.scale!==preferences.scale){preferences.scale=next.scale;apply();}else layout();},{passive:true});
 addEventListener('storage',event=>{if(event.key===preferenceKey){preferences=read();apply();}});
 const toolbar=document.querySelector('.lesson-toolbar');
 let headerFrame=0;
 if(toolbar)new ResizeObserver(()=>{if(!headerFrame)headerFrame=requestAnimationFrame(()=>{headerFrame=0;const value=toolbar.offsetHeight+'px';if(document.documentElement.style.getPropertyValue('--mechanism-header-height')!==value)document.documentElement.style.setProperty('--mechanism-header-height',value);});}).observe(toolbar);
 function save(changed){
  try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch{
   const status=document.getElementById('interface-status');if(status)status.textContent='Настройки действуют в этой вкладке. Сохранение в браузере недоступно.';
  }
  apply(true,changed);
 }
}
