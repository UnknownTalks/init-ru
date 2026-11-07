// Only the public watch's physical pose is shared; lesson and agent UI state
// continue to belong to their existing owners.
export const watchKey='unknowntalks:watch-pose:v1';
export function readWatchPose(){
 try{
  const pose=JSON.parse(sessionStorage.getItem(watchKey)||'null');
  if(!pose||!['drive','index','balance','lever'].every(key=>Number.isFinite(pose[key])&&Math.abs(pose[key])<1e8))return null;
  if(pose.gearDrive!==undefined&&!Number.isFinite(pose.gearDrive))return null;
  if(pose.physical){const p=pose.physical;if(!['angle','target','transmitted','gear','velocity','gearVelocity','at'].every(key=>Number.isFinite(p[key]))||['angle','target','transmitted','gear'].some(key=>Math.abs(p[key])>=1e8)||Math.abs(p.velocity)>1e5||Math.abs(p.gearVelocity)>1e5)delete pose.physical;}
  return pose;
 }catch{return null;}
}
export function normalizeWatchPose(pose){
 const period=360*65,shift=Math.trunc(pose.index/period)*period;
 const result={drive:pose.drive-shift*2.4,index:pose.index-shift,balance:pose.balance,lever:pose.lever};
 if(Number.isFinite(pose.gearDrive))result.gearDrive=pose.gearDrive-shift*2.4;
 if(pose.physical){
  const p=pose.physical;
  if(['angle','target','transmitted','gear','velocity','gearVelocity','at'].every(key=>Number.isFinite(p[key])))result.physical={...p,angle:p.angle-shift,target:p.target-shift,transmitted:p.transmitted-shift,gear:p.gear-shift};
 }
 return result;
}
export function writeWatchPose(pose){try{sessionStorage.setItem(watchKey,JSON.stringify(normalizeWatchPose(pose)));}catch{}}
export function paintWatchPose(host,value){
 if(!host||!value)return;
 for(const svg of host.querySelectorAll('[data-mechanism]')){
  const parts=Object.fromEntries([...svg.querySelectorAll('[data-turn]')].map(el=>[el.dataset.turn,el]));
  parts.wheel.setAttribute('transform',`rotate(${value.drive})`);parts.transfer.setAttribute('transform',`rotate(${-(value.gearDrive??value.drive)*1.25})`);parts.escape.setAttribute('transform',`rotate(${(value.gearDrive??value.drive)*25/13})`);
  parts.balance.setAttribute('transform',`rotate(${value.balance})`);parts.lever.setAttribute('transform',`rotate(${value.lever})`);parts.index.setAttribute('transform',`rotate(${value.index} 160 160)`);
 }
 const path='M'+Array.from({length:110},(_,i)=>{const t=i/109,a=t*Math.PI*8+value.balance*Math.PI/180*(1-t),r=3+t*23;return (Math.cos(a)*r).toFixed(2)+','+(Math.sin(a)*r).toFixed(2);}).join('L');
 for(const spring of host.querySelectorAll('[data-spring]'))spring.setAttribute('d',path);
}
