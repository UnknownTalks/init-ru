// The selected Balance · Signature instrument; no experimental UI is shipped.
export const signature=Object.freeze({inertia:1.1,stiffness:320,damping:32,friction:3,backlash:.25,reversal:.95,maxVelocity:1200,stop:.08,tolerance:.02,ratio:.085,gearStiffness:400,gearDamping:34,gearFlex:.45,precision:.15});
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const createWatchState=(angle=0)=>({angle,target:angle,transmitted:angle,velocity:0,gear:angle,gearVelocity:0,accumulator:0});
export function advanceWatch(s,seconds,{held=false,coast=false}={}){
 const c=signature,h=1/240;s.accumulator+=clamp(seconds,0,.064);
 while(s.accumulator+1e-10>=h){
  s.accumulator-=h;
  if(!held){
   if(coast){
    s.velocity*=Math.exp(-c.damping/c.inertia*h);s.velocity=Math.sign(s.velocity)*Math.max(0,Math.abs(s.velocity)-c.friction/c.inertia*h);
    if(Math.abs(s.velocity)<c.stop)s.velocity=0;
    s.angle+=s.velocity*h;s.target=s.transmitted=s.angle;
   }else{
    const gap=c.backlash/2;s.transmitted=s.target>s.transmitted+gap?s.target-gap:s.target<s.transmitted-gap?s.target+gap:s.transmitted;
    const diff=s.transmitted-s.angle;let force=c.stiffness*diff-c.damping*s.velocity;
    if(Math.abs(s.velocity)>c.stop)force-=Math.sign(s.velocity)*c.friction;else force=Math.sign(force)*Math.max(0,Math.abs(force)-c.friction);
    s.velocity=clamp(s.velocity+force/c.inertia*h*(s.velocity*diff<0?c.reversal:1),-c.maxVelocity,c.maxVelocity);s.angle+=s.velocity*h;
    if(Math.abs(diff)<Math.max(c.tolerance,c.friction/c.stiffness)&&Math.abs(s.velocity)<c.stop)s.velocity=0;
   }
  }
  s.gearVelocity+=(c.gearStiffness*(s.angle-s.gear)-c.gearDamping*s.gearVelocity)*h;s.gear+=s.gearVelocity*h;
  s.gear=clamp(s.gear,s.angle-c.gearFlex,s.angle+c.gearFlex);
  if(Math.abs(s.gear-s.angle)<.002&&Math.abs(s.gearVelocity)<.02){s.gear=s.angle;s.gearVelocity=0;}
 }
 return s;
}
export const watchMoving=s=>Math.abs(s.velocity)>.08||Math.abs(s.gear-s.angle)>.005||Math.abs(s.target-s.angle)>.145;
export const watchAngles=s=>[s.angle*2.4,-s.gear*3,s.gear*60/13];
export function agentRotation(elapsed){
 const T=.65,S=.65,p=2.7,total=1080,peak=total/(T/(p+1)+S/3),t=clamp(elapsed/1000,0,T+S);
 if(t<T)return {angle:peak*T*(t/T)**(p+1)/(p+1),velocity:peak*(t/T)**p};
 const u=(t-T)/S;return {angle:total-peak*S*(1-u)**3/3,velocity:peak*(1-u)**2};
}
