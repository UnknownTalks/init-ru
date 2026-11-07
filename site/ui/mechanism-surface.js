import {viewportRect} from './viewport.js';
import {clamp} from './mechanism-profile.js';
export function createSignatureStress(host){
 const canvas=host.querySelector('canvas'),ctx=canvas?.getContext('2d');
 let particles=[],width=0,height=0,scale=1,source={x:0,y:0},last=-Infinity,previous=0,heat=0;
 function resize(){
  const box=viewportRect(host),dial=viewportRect(host.querySelector('svg'));
  width=host.clientWidth;height=host.clientHeight;
  const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx?.setTransform(dpr,0,0,dpr,0,0);
  // Wheel / transfer mesh contact: (174,159) in original SVG coordinates.
  const zoom=box.width/width||1;
  source={x:(dial.left-box.left+dial.width*174/320)/zoom,y:(dial.top-box.top+dial.height*159/320)/zoom};
  scale=dial.width/zoom/88;
 }
 function burst(c,strength,now,direction=1){
  if(!ctx||strength<=0||now-last<c.cooldown)return;
  last=now;heat=clamp(strength,0,1);
  const count=Math.round(c.particles*clamp(strength,.15,1)*(devicePixelRatio>2?.7:1));
  for(let i=0;i<count;i++){
   const a=(direction>0?-.45:Math.PI+.45)+(Math.random()-.5)*c.spread;
   const speed=c.particleVelocity*(.6+Math.random()*.6)*scale;
   particles.push({x:source.x,y:source.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,age:0,life:c.lifetime/1000*(.7+Math.random()*.3)});
  }
  particles=particles.slice(-30);
 }
 function step(c,velocity,dt,now,reduced){
  if(reduced||c.sparkMode==='off'){reset();previous=velocity;return false;}
  const accel=(velocity-previous)/Math.max(.004,dt),speed=Math.abs(velocity),decel=(Math.abs(previous)-speed)/Math.max(.004,dt);
  let strength=0;
  strength=(speed+Math.abs(accel)*.06)/c.threshold-1;
  if(strength>0)burst(c,clamp(strength,.15,1),now,Math.sign(velocity||previous));
  previous=velocity;
  ctx?.clearRect(0,0,width,height);heat*=Math.exp(-dt*8);if(heat<.01)heat=0;
  for(const p of particles){
   p.age+=dt;if(p.age>=p.life)continue;
   const oldX=p.x,oldY=p.y;p.vx*=Math.exp(-3.4*dt);p.vy=p.vy*Math.exp(-3.4*dt)+110*scale*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
   if(ctx){ctx.globalAlpha=c.brightness*(1-p.age/p.life)**c.cooling;ctx.strokeStyle=p.age/p.life<.2?'#eee0be':'#ba8350';ctx.lineWidth=.8*scale;ctx.beginPath();ctx.moveTo(oldX,oldY);ctx.lineTo(p.x,p.y);ctx.stroke();}
  }
  particles=particles.filter(p=>p.age<p.life);if(ctx)ctx.globalAlpha=1;
  host.style.setProperty('--watch-heat',heat*.22);
  return particles.length>0;
 }
 function reset(){particles=[];heat=0;previous=0;ctx?.clearRect(0,0,width,height);host.style.setProperty('--watch-heat',0);}
 resize();return {resize,step,burst,reset,get count(){return particles.length;}};
}

export const signatureStress=Object.freeze({sparkMode:'load',threshold:950,particles:8,lifetime:240,brightness:.55,cooldown:1400,particleVelocity:140,spread:.8,cooling:1.8});
export function createSignatureAppearance(host){
 const svg=host.querySelector('svg'),base=svg.querySelector('linearGradient[id$="-steel"]'),defs=svg.querySelector('defs'),ns='http://www.w3.org/2000/svg';
 const colors=['#41474b','#22272b','#111416'];
 [...base.children].forEach((stop,i)=>stop.setAttribute('stop-color',colors[i]));
 const gradients=['wheel','transfer','escape'].map(name=>{
  const gradient=base.cloneNode(true);gradient.id='signature-metal-'+name;defs.append(gradient);
  const group=svg.querySelector('[data-turn='+name+']');
  group.querySelectorAll('[fill]').forEach(el=>{if(el.getAttribute('fill').includes('-steel'))el.setAttribute('fill','url(#'+gradient.id+')');});
  return {gradient,group};
 });
 svg.querySelectorAll('radialGradient[id$="-case"] stop').forEach((stop,i)=>stop.setAttribute('stop-color',[colors[0],colors[2],'#080a0b'][i]));
 const faces=[...svg.querySelectorAll('.gear-face')];let last=-Infinity;
 return angle=>{
  if(Math.abs(angle-last)<.8)return;last=angle;
  const light=.5+.5*Math.cos(angle*Math.PI/180);
  faces.forEach(face=>face.setAttribute('stroke',`rgba(175,183,181,${.4*(.75+light*.25)})`));
  gradients.forEach(({gradient,group})=>{const a=Number(group.getAttribute('transform')?.match(/rotate\(([^)]+)/)?.[1]||0);gradient.setAttribute('gradientTransform',`rotate(${-a-25} .5 .5)`);});
  host.style.setProperty('--watch-reflection',String(.045+light*.055));
 };
}
