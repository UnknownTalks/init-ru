import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileViewport} from './ui/mobile-header.js';
test('visible viewport supplies a common origin and extent through toolbar and keyboard changes',()=>{
 assert.deepEqual(mobileViewport({width:390,height:820,top:24,scroll:300,maxScroll:2000}),{top:24,left:0,width:390,height:820});
 assert.deepEqual(mobileViewport({width:390,height:400,top:160,scroll:300,maxScroll:2000},1.25),{top:128,left:0,width:312,height:320});
});
test('elastic overscroll and browser pinch cannot become persistent header displacement',()=>{
 for(const scroll of [-35,2035])assert.equal(mobileViewport({width:390,height:844,top:35,scroll,maxScroll:2000}).top,0);
 assert.equal(mobileViewport({width:390,height:844,top:160,visualScale:2,scroll:300}).top,0);
});
