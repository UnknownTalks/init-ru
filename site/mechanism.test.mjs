import test from 'node:test';
import assert from 'node:assert/strict';
import {createWatchState,advanceWatch,watchMoving,watchAngles,agentRotation} from './ui/mechanism-profile.js';
import {normalizeWatchPose,readWatchPose} from './ui/mechanism-memory.js';
import {soundAllowed,soundModes} from './ui/mechanism-sound.js';

test('Signature spring and compliant gears are stable across frame rates',()=>{
 const samples=[];
 for(const fps of [30,60,120,144]){const s=createWatchState();s.target=90;for(let i=0;i<fps*5;i++)advanceWatch(s,1/fps);assert(!watchMoving(s));samples.push(s);}
 for(const s of samples){assert(Math.abs(s.angle-samples[0].angle)<1e-8);assert(Math.abs(s.angle-90)<.15);}
 const s=createWatchState();s.velocity=1200;let old=s.velocity;
 for(let i=0;i<300;i++){advanceWatch(s,1/60,{coast:true});assert(s.velocity>=0&&s.velocity<=old);old=s.velocity;}assert.equal(s.velocity,0);
});
test('one gear train maintains signed 25 / 20 / 13 tooth ratios',()=>{
 for(const angle of [-23400,-41,0,19,23400]){const s=createWatchState(angle),[a,b,c]=watchAngles(s);assert(Math.abs(a*25+b*20)<1e-8);assert(Math.abs(b*20+c*13)<1e-8);}
});
test('quiet agent activation has exactly three turns and settles without a waiting gate',()=>{
 assert.equal(agentRotation(0).angle,0);assert.equal(agentRotation(1300).angle,1080);assert.equal(agentRotation(1300).velocity,0);
 assert(Math.abs(agentRotation(650-1e-5).velocity-agentRotation(650+1e-5).velocity)<.001);
});
test('watch memory normalization preserves every phase and spring deflection',()=>{
 const angle=360*65*130+17,s=createWatchState(angle);s.gear=angle-.2;s.target=angle+2;s.transmitted=angle+1;
 const pose={drive:s.angle*2.4,index:s.angle,gearDrive:s.gear*2.4,balance:1,lever:-.4,physical:{...s,at:1234}};
 const normalized=normalizeWatchPose(pose);assert(Math.abs(normalized.index-17)<1e-8);
 const phase=a=>((a%360)+360)%360;
 for(const [a,b] of [[pose.drive,normalized.drive],[pose.gearDrive*25/13,normalized.gearDrive*25/13],[pose.gearDrive*25/20,normalized.gearDrive*25/20]])assert(Math.abs(phase(a)-phase(b))<1e-6);
 assert(Math.abs((normalized.physical.target-normalized.physical.angle)-2)<1e-8);
});
test('sound preference gates the instrument, other actions, and passive scroll separately',()=>{
 assert.equal(Object.keys(soundModes).length,4);
 assert.deepEqual(['watch','action','scroll'].map(s=>soundAllowed('off',s)),[false,false,false]);
 assert.deepEqual(['watch','action','scroll'].map(s=>soundAllowed('watch',s)),[true,false,false]);
 assert.deepEqual(['watch','action','scroll'].map(s=>soundAllowed('actions',s)),[true,true,false]);
 assert.deepEqual(['watch','action','scroll'].map(s=>soundAllowed('all',s)),[true,true,true]);
});

test('corrupt physical memory keeps a valid visible pose without integrating invalid torque',()=>{
 const storage=globalThis.sessionStorage;
 try{
  globalThis.sessionStorage={getItem:()=>JSON.stringify({drive:25,index:13,balance:0,lever:0,physical:{angle:1e300,target:-1e300,transmitted:0,gear:0,velocity:0,gearVelocity:0,at:Date.now()}})};
  const pose=readWatchPose();assert.equal(pose.drive,25);assert.equal(pose.physical,undefined);
 }finally{if(storage===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=storage;}
});
