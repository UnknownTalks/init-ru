import {initPreferences} from './ui/preferences.js';
import {initTactile} from './ui/tactile.js';
import {initLessonMechanism} from './ui/mechanism.js';
import {initAgent} from './ui/agent.js';
import {createLessonViews} from './lesson-views.js';
import {enhanceSelects} from './select.js';

initPreferences();const motion=initTactile();let views=null;
initLessonMechanism({openAgentView:()=>views?.open('mechanism-agent')});
initAgent();
const config=JSON.parse(document.getElementById('home-data').textContent);
function progress(){
 try{
  const state=JSON.parse(localStorage.getItem(config.storageKey)||'{}'),chapter=config.chapters.find(c=>c.id===state.activeView);
  const copy=document.getElementById('home-reading-progress');
  copy.hidden=!state.started;
  copy.textContent=state.storyComplete?'История прочитана. Можно вернуться к любой открытой главе.':chapter?'Вы остановились: '+chapter.title:'Место чтения сохранено.';
  document.getElementById('home-lesson-action').textContent=state.started&&!state.storyComplete?'Продолжить урок':'Открыть урок';
 }catch{ /* A new reader can always open the lesson. */ }
}
progress();addEventListener('storage',progress);addEventListener('pageshow',progress);
views=createLessonViews({storageKey:'unknowntalks:home:v1',motion,rememberReading(){},restoreReading(){scrollTo({top:0,behavior:'instant'});},pauseReading(){},resumeReading(){},onChange(){}});
enhanceSelects();
