import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveInterfacePreference as resolve} from './ui/interface-preference.js';
test('desktop and phone use separate defaults and saved magnifications',()=>{
 assert.equal(resolve({},1440,false).scale,125);
 assert.equal(resolve({},390,true).scale,100);
 const saved={desktopScale:150,mobileScale:110};
 assert.equal(resolve(saved,1440,false).scale,150);
 assert.equal(resolve(saved,390,true).scale,110);
 assert.equal(resolve(saved,844,true).mobile,true);
 assert.equal(resolve(saved,1024,false).mobile,false);
});
test('legacy root zoom cannot carry desktop magnification onto a phone',()=>{
 assert.equal(resolve({scale:125},390,true).scale,100);
 assert.equal(resolve({scale:125},1440,false).scale,125);
 assert.equal(resolve({desktopScale:'150',mobileScale:-10},390,true).scale,100);
 assert.equal(resolve({desktopScale:999},1440,false).scale,125);
});
