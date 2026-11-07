// Small material reactions, driven by the lesson clock's existing frame loop.
// No independent timer, scroll listener, sound or animation queue.
export function createMechanismFriction(host){
 const canvas=host.querySelector('.mechanism-sparks'),body=host.querySelector('.lesson-mechanism-case');
 const ctx=canvas.getContext('2d');
 if(!ctx)return {feed(){},spin(){},resize(){},reset(){},tick(){return false;}};
 const clamp=n=>Math.max(0,Math.min(1,n));
 let width=0,height=0,scale=1,bodyWidth=88,source={x:0,y:0};
 let particles=[],history=[],heat=0,flash=0,recoil=0,velocity=0,armed=true;
 let lastInput=-Infinity,lastBurst=-Infinity,lastSpin=-Infinity,lastDirection=0;
 function state(value){if(host.dataset.friction!==value)host.dataset.friction=value;}
 function finish(){
  for(const [name,value]of Object.entries({'heat':'0','x':'0px','y':'0px','turn':'0deg'}))body.style.setProperty('--friction-'+name,value);
  ctx.clearRect(0,0,width,height);state('idle');
 }
 function reset(){
  particles=[];history=[];heat=flash=recoil=velocity=0;armed=true;
  lastInput=lastBurst=lastSpin=-Infinity;lastDirection=0;finish();
 }
 function resize(){
  reset();width=host.clientWidth;height=host.clientHeight;
  const ratio=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
  ctx.setTransform(ratio,0,0,ratio,0,0);
  bodyWidth=body.offsetWidth;scale=(parseFloat(getComputedStyle(host).getPropertyValue('--mechanism-dial-size'))||88)/88;
  source={x:body.offsetLeft+bodyWidth*.545,y:body.offsetTop+body.offsetHeight*.494};
 }
 function burst(strength,direction,now){
  const count=Math.round(8+strength*10),angle=direction>0?-.55:Math.PI+.55;
  for(let i=0;i<count;i++){
   const a=angle+(Math.random()-.5)*1.15,speed=(80+Math.random()*140)*(.65+strength*.45)*scale;
   particles.push({x:source.x+(Math.random()-.5)*2,y:source.y+(Math.random()-.5)*2,
    vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,age:0,life:.24+Math.random()*.28,width:(.6+Math.random()*.55)*scale});
  }
  particles=particles.slice(-30);lastBurst=now;
  flash=Math.max(flash,.5+strength*.5);heat=Math.max(heat,.6+strength*.4);
  velocity=Math.max(-55,Math.min(55,velocity+direction*(15+strength*17)));
  armed=false;state('sparks');
 }
 function feed(distance,now){
  const direction=Math.sign(distance);
  if(now-lastInput>350||direction!==lastDirection){armed=true;history=[];}
  history=history.filter(sample=>now-sample.at<180);
  history.push({at:now,distance:Math.abs(distance)});
  const travel=history.reduce((sum,sample)=>sum+sample.distance,0),load=clamp((travel-1100)/900);
  if(heat>.2&&direction!==lastDirection&&lastDirection&&now-lastInput<160&&travel>550)
   velocity=Math.max(-55,Math.min(55,velocity+direction*(17+load*22)));
  // A large fling in either direction, at most once a second. Reversing the
  // gesture starts a fresh distance window; tiny reversals cannot add up.
  if(armed&&travel>=1100&&now-lastBurst>=1000)burst(load,direction,now);
  lastDirection=direction;lastInput=now;
 }
 function spin(strength,now){
  // Opening the agent is a deliberate winding, independent of the scroll
  // Easter egg's threshold. Keep the same small, bounded particle system.
  if(now-lastSpin<200-strength*70)return;
  lastSpin=now;burst(clamp(strength),1,now);
 }
 function tick(now,dt){
  if(!particles.length&&!heat&&!flash&&!recoil&&!velocity)return false;
  const seconds=dt/1000,drag=Math.exp(-3.4*seconds);
  heat*=Math.exp(-dt/300);flash*=Math.exp(-dt/85);
  if(heat<.015)heat=0;if(flash<.01)flash=0;
  // A short damped torsion of the case, independent of the gear angles.
  for(let left=seconds;left>0;){const step=Math.min(.016,left);velocity+=(-580*recoil-30*velocity)*step;recoil+=velocity*step;left-=step;}
  if(Math.abs(recoil)<.001&&Math.abs(velocity)<.015)recoil=velocity=0;
  body.style.setProperty('--friction-heat',(heat*.7).toFixed(4));
  body.style.setProperty('--friction-x',(recoil*.7).toFixed(4)+'px');
  body.style.setProperty('--friction-y',(Math.abs(recoil)*.18).toFixed(4)+'px');
  body.style.setProperty('--friction-turn',(recoil*.7).toFixed(4)+'deg');
  ctx.clearRect(0,0,width,height);ctx.globalCompositeOperation='lighter';
  if(flash){
   const radius=22*scale,light=ctx.createRadialGradient(source.x,source.y,0,source.x,source.y,radius);
   light.addColorStop(0,`rgba(255,220,165,${flash*.34})`);light.addColorStop(.3,`rgba(229,151,71,${flash*.1})`);light.addColorStop(1,'rgba(202,110,40,0)');
   ctx.fillStyle=light;ctx.fillRect(source.x-radius,source.y-radius,radius*2,radius*2);
  }
  particles=particles.filter(p=>p.age<p.life);
  for(const p of particles){
   p.age+=seconds;p.vx*=drag;p.vy=p.vy*drag+65*seconds*scale;p.x+=p.vx*seconds;p.y+=p.vy*seconds;
   const t=clamp(p.age/p.life),alpha=(1-t)**1.5;
   const tail=Math.min(.028,.016+t*.02),x=p.x-p.vx*tail,y=p.y-p.vy*tail;
   const trail=ctx.createLinearGradient(x,y,p.x+.001,p.y+.001);
   trail.addColorStop(0,'rgba(172,88,28,0)');trail.addColorStop(.45,`rgba(235,159,80,${alpha*.65})`);trail.addColorStop(1,`rgba(255,244,211,${alpha})`);
   ctx.strokeStyle=trail;ctx.lineWidth=p.width;ctx.lineCap='round';ctx.shadowColor=`rgba(255,182,96,${alpha*.8})`;ctx.shadowBlur=3*scale;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(p.x,p.y);ctx.stroke();
   ctx.fillStyle=`rgba(255,242,208,${alpha*.85})`;ctx.beginPath();ctx.arc(p.x,p.y,p.width*.55,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
  const moving=!!(particles.length||heat||flash||recoil||velocity);
  if(!moving)finish();else state(particles.length?'sparks':'cooling');
  return moving;
 }
 resize();return {feed,spin,resize,reset,tick};
}
