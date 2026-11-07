import { createMotion } from './motion.js';
import { initClockKeys } from './clock-keys.js';
import { initClockLayout } from './clock-layout.js';

export function initTactile() {
 const root=document.documentElement;
 if(!root.hasAttribute('data-tactile'))return null;
 root.dataset.clock='';
 const setting=document.querySelector('.motion-setting');if(setting)setting.hidden=false;
 const motion=createMotion();
 initClockKeys(motion);
 return Object.assign(motion,initClockLayout(motion));
}
