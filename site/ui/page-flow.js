import {installPageTransitions} from './page-transitions.js';
import {readWatchPose,writeWatchPose,paintWatchPose} from './mechanism-memory.js';
const transferKey='unknowntalks:page-transfer:v1',root=document.documentElement;
let departing=false,capture=null,restore=null,prepareWatch=null;
function saveWatch(force=false){if((force||!departing)&&capture)writeWatchPose(capture());}
function restoreWatch(){
 const pose=readWatchPose();
 if(restore)restore(pose);else paintWatchPose(document.querySelector('[data-lesson-mechanism]'),pose);
}
function preference(){try{return localStorage.getItem('unknowntalks:motion:v1')||'clock';}catch{return 'clock';}}
function enabled(){const choice=preference();return choice==='clock'||choice==='system'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;}
function incoming(){try{const transfer=JSON.parse(sessionStorage.getItem(transferKey)||'null');return transfer?.to===location.href&&Date.now()-transfer.at<8000;}catch{return false;}}
const home=new URL(document.currentScript.src,location.href);home.pathname=home.pathname.replace(/static\/page-flow\.js$/,'');home.search='';
const eligible=url=>url.origin===location.origin&&(url.pathname===home.pathname||url.pathname===home.pathname+'index.html'||/^01-foundations\/01-from-data-to-agents\/(chat|story|dialog|formats)\.html$/.test(url.pathname.slice(home.pathname.length)));
window.UnknownTalksPage={restoreWatch,saveWatch,attachWatch(api){capture=api.capture;restore=api.restore;prepareWatch=api.prepare;},resume(){departing=false;}};
installPageTransitions({eligible,incoming,enabled,prepare(url){
 prepareWatch?.(url);saveWatch(true);departing=true;
 try{sessionStorage.setItem(transferKey,JSON.stringify({to:url,at:Date.now()}));}catch{}
},restore(){departing=false;restoreWatch();}});
addEventListener('pagehide',()=>saveWatch());
addEventListener('pageshow',event=>{if(event.persisted){departing=false;restoreWatch();}});
