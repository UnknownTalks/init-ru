import test from 'node:test';
import assert from 'node:assert/strict';
import {createMenuDrive,stepMenuDrive} from './ui/menu-drive.js';
test('drawer transmission has bounded travel, a deliberate pull and frame-rate-independent stop',()=>{
 const results=[];
 for(const fps of [30,60,120]){
  const s=createMenuDrive();s.target=1;let elapsed=0,previous=0;
  while(stepMenuDrive(s,1/fps)&&elapsed<3){assert(s.position>=previous);assert(s.position<=1);previous=s.position;elapsed+=1/fps;}
  assert.equal(s.position,1);assert.equal(s.velocity,0);assert(elapsed>.8&&elapsed<2);results.push(elapsed);
 }
 assert(Math.max(...results)-Math.min(...results)<.05);
});
test('reversing a partly open drawer retains its position and dissipates momentum',()=>{
 const s=createMenuDrive();s.target=1;for(let i=0;i<25;i++)stepMenuDrive(s,1/60);
 const before=s.position;s.target=0;stepMenuDrive(s,1/120);assert(Math.abs(s.position-before)<.02);
 for(let i=0;i<240;i++)stepMenuDrive(s,1/120);
 assert.equal(s.position,0);assert.equal(s.velocity,0);
});
test('the 1.5× transmission rate compresses travel time without changing the path',()=>{
 for(const fps of [30,60,120]){
  const normal=createMenuDrive(),fast=createMenuDrive();normal.target=fast.target=1;
  let a=0,b=0;
  while(stepMenuDrive(normal,1/fps)&&a<3)a+=1/fps;
  while(stepMenuDrive(fast,1/fps,1.5)&&b<3)b+=1/fps;
  assert.equal(fast.position,normal.position);assert.equal(fast.velocity,0);
  assert(Math.abs(a/b-1.5)<.08,JSON.stringify({fps,a,b}));
 }
});
