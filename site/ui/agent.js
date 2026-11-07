import {viewportRect,viewportRangeRect} from './viewport.js';
import {agentEnabled,interfaceScale} from './preferences.js';

const storageKey='unknowntalks:agent-chats:v1';
const replyIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v7a4 4 0 0 0 4 4h10m-4-4 4 4-4 4"/></svg>';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(text,cls='')=>{const el=node('button','ui-button '+cls,text);el.type='button';return el;};
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
function stored(){
 try{const value=JSON.parse(localStorage.getItem(storageKey)||'{}');return {active:value.active,chats:Array.isArray(value.chats)?value.chats.filter(c=>c&&typeof c.id==='string'&&Array.isArray(c.messages)):[]};}catch{return {chats:[]};}
}
function sourceURL(source){
 try{const url=new URL(source.href,location.href);return url.origin===location.origin?url.pathname+url.search+url.hash:'#';}catch{return '#';}
}

export function initAgent({lesson=null,onSource=null,onContextChange=()=>{},motion=null}={}){
 const full=document.getElementById('mechanism-agent');if(!full)return;
 const reader=document.getElementById('lesson-reader');
 const saved=stored();let chats=saved.chats,activeId=saved.active,contextTarget=null,returnOffset=0,selection=null;
 const widgets=[];let contextWidget=null,serial=0,threadMotion=null,threadRevision=0,selectionTimer=null;
 const current=()=>chats.find(chat=>chat.id===activeId);
 function makeChat(source=null){
  const chat={id:uid(),title:'Новый чат',createdAt:Date.now(),updatedAt:Date.now(),messages:[],draft:'',source,pendingSource:source};
  chats.push(chat);activeId=chat.id;return chat;
 }
 function ensureChat(){return current()||makeChat();}
 function persist(){
  const chat=current();if(!chat)return;
  const existing=stored(),merged=new Map(existing.chats.map(c=>[c.id,c]));
  // Merge this conversation without overwriting another tab's conversations.
  if(chat.messages.length||chat.draft)merged.set(chat.id,chat);
  try{localStorage.setItem(storageKey,JSON.stringify({version:1,active:chat.id,chats:[...merged.values()]}));}
  catch{for(const widget of widgets)widget.status.textContent='Не удалось сохранить чат в браузере. Пока он доступен только в этой вкладке.';}
 }
 function changeChat(id){
  if(!chats.some(c=>c.id===id))return;activeId=id;persist();render();
  if(document.body.dataset.appView==='agent'){
   const url=new URL(location.href);url.searchParams.set('chat',id);url.searchParams.delete('chats');window.history.pushState(window.history.state,'',url);syncHistoryMode();
  }
 }
 function newChat(){makeChat();render();if(document.body.dataset.appView==='agent'){const url=new URL(location.href);url.searchParams.delete('chat');url.searchParams.delete('chats');window.history.pushState(window.history.state,'',url);syncHistoryMode();}fullWidget.input.focus();}
 function renderHistory(){
  historyList.replaceChildren();
  const items=chats.filter(c=>c.messages.length||c.draft).sort((a,b)=>b.updatedAt-a.updatedAt);
  if(!items.length){historyList.append(node('p','agent-history-empty','Здесь появятся ваши переписки.'));return;}
  for(const chat of items){
   const item=node('li'),open=button('', 'agent-history-item');open.dataset.chatId=chat.id;
   if(chat.id===activeId)open.setAttribute('aria-current','true');
   open.append(node('span','agent-history-title',chat.title),node('small','',chat.messages.length?new Intl.DateTimeFormat('ru',{day:'numeric',month:'short'}).format(new Date(chat.updatedAt)):'Черновик'));
   open.addEventListener('click',()=>changeChat(chat.id));item.append(open);historyList.append(item);
  }
 }
 function sourceCard(source,removable=false){
  const card=node('blockquote','agent-source');
  card.append(node('span','agent-source-author',source.author||'Из урока'),node('p','',source.text));
  const link=node('a','agent-source-link','К сообщению ↗');link.href=sourceURL(source);
  link.addEventListener('click',event=>{
   if(onSource&&lesson&&source.lessonId===lesson.id&&!event.metaKey&&!event.ctrlKey){event.preventDefault();closeContext(false);onSource(source.messageId);}
  });card.append(link);
  if(removable){const remove=button('×','ui-button-ghost agent-source-remove');remove.setAttribute('aria-label','Убрать фрагмент из вопроса');remove.addEventListener('click',()=>{ensureChat().pendingSource=null;persist();render();});card.append(remove);}
  return card;
 }
 function widget(container,compact=false){
  const messages=node('div','agent-messages');messages.setAttribute('aria-label','Сообщения чата');
  const pending=node('div','agent-pending-source');
  const form=node('form','agent-composer'),label=node('label','sr-only','Ваше сообщение'),input=node('textarea','agent-input');
  input.id=compact?'unknowntalks-agent-context-question':'unknowntalks-agent-question';input.rows=compact?2:3;input.maxLength=4000;input.placeholder=compact?'Написать в обсуждение…':'Напишите сообщение…';label.htmlFor=input.id;
  const actions=node('div','agent-composer-actions'),send=button('Добавить','agent-send');send.type='submit';send.disabled=true;
  const note=node('p','agent-local-note','ИИ пока не подключён. Переписка сохраняется в этом браузере.');
  const status=node('p','agent-status');status.setAttribute('role','status');
  actions.append(send);form.append(pending,label,input,actions,note,status);container.append(messages,form);
  const result={container,messages,pending,form,input,send,status,compact};widgets.push(result);
  input.addEventListener('input',()=>{const chat=ensureChat();chat.draft=input.value;chat.updatedAt=Date.now();send.disabled=!input.value.trim();persist();renderHistory();updateTriggers();});
  form.addEventListener('submit',event=>{
   event.preventDefault();if(!agentEnabled())return;const text=input.value.trim();if(!text)return;
   const chat=ensureChat();chat.messages.push({id:uid(),role:'user',text,at:Date.now(),source:chat.pendingSource||null});
   if(chat.messages.length===1)chat.title=text.length>64?text.slice(0,63)+'…':text;
   chat.draft='';chat.pendingSource=null;chat.updatedAt=Date.now();persist();render();status.textContent='Сообщение сохранено.';input.focus({preventScroll:true});
   if(compact)form.scrollIntoView({block:'nearest',behavior:'auto'});
  });
  return result;
 }
 const heading=full.querySelector('.mechanism-agent-heading');
 heading.querySelector('span').textContent='Ваши переписки';
 full.querySelector('.mechanism-agent-message')?.remove();
 const workspace=node('div','agent-workspace'),history=node('aside','agent-history');history.setAttribute('aria-label','История чатов');
 const historyHeading=node('div','agent-history-heading');historyHeading.append(node('h3','','Чаты'));
 const create=button('+ Новый чат','ui-button-ghost agent-new-chat');create.addEventListener('click',newChat);historyHeading.append(create);
 const historyList=node('ol','agent-history-list');history.append(historyHeading,historyList);
 const chatPane=node('section','agent-conversation');chatPane.setAttribute('aria-label','Текущий чат');
 const chatHeading=node('div','agent-conversation-heading'),chatTitle=node('h3','agent-chat-title');chatHeading.append(chatTitle);
 const showHistory=button('История чатов','ui-button-ghost agent-history-toggle');
 const backToChat=button('← К диалогу','ui-button-ghost agent-history-back');
 showHistory.addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('chats','1');historyPush(url);});
 backToChat.addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.delete('chats');historyPush(url);});
 function historyPush(url){window.history.pushState(window.history.state,'',url);syncHistoryMode();scrollTo({top:0,behavior:'instant'});}
 history.prepend(backToChat);chatHeading.append(showHistory);chatPane.append(chatHeading);
 workspace.append(history,chatPane);heading.after(workspace);
 const fullWidget=widget(chatPane);
 const disabled=node('p','agent-disabled-note','ИИ-агент выключен. Чаты сохранены — включите агента в настройках, чтобы продолжить.');workspace.after(disabled);
 const thread=node('section','lesson-agent-thread');thread.id='lesson-agent-thread';thread.hidden=true;thread.dataset.agentUi='';thread.setAttribute('aria-label','Обсуждение сообщения с ИИ-агентом');
 const threadHeading=node('header','agent-thread-heading');threadHeading.append(node('span','agent-thread-mark','↳'),node('h3','','Обсуждение с агентом'));thread.append(threadHeading);
 contextWidget=widget(thread,true);
 const threadFooter=node('footer','agent-thread-footer'),close=button('Свернуть','ui-button-ghost agent-thread-close');close.setAttribute('aria-label','Свернуть обсуждение и вернуться к сообщению');close.addEventListener('click',()=>closeContext(true,true));
 const allChats=button('В истории чатов ↗','ui-button-ghost agent-all-chats');allChats.dataset.viewBack='mechanism-agent';threadFooter.append(close,allChats);thread.append(threadFooter);document.body.append(thread);
 full.dataset.agentUi='';
 function render(){
  const chat=ensureChat();chatTitle.textContent=chat.title;
  for(const w of widgets){
   w.messages.replaceChildren();
   w.messages.hidden=w.compact&&!chat.messages.length;
   if(!chat.messages.length&&!w.compact)w.messages.append(node('p','agent-empty',chat.pendingSource?'Задайте вопрос об этом фрагменте.':'Начните разговор — здесь останутся ваши вопросы и контекст.'));
   for(const message of chat.messages){
    const bubble=node('article','agent-user-message');bubble.append(node('span','agent-message-author','Вы'));
    if(message.source&&(!w.compact||message.source.selection))bubble.append(sourceCard(message.source));bubble.append(node('p','agent-question-text',message.text));w.messages.append(bubble);
   }
   w.pending.replaceChildren();if(chat.pendingSource&&(!w.compact||chat.pendingSource.selection))w.pending.append(sourceCard(chat.pendingSource,true));
   w.input.value=chat.draft||'';w.send.disabled=!w.input.value.trim();w.status.textContent='';
  }
  renderHistory();updateTriggers();workspace.hidden=!agentEnabled();disabled.hidden=agentEnabled();
 }
 function syncHistoryMode(){full.dataset.history=new URL(location.href).searchParams.get('chats')==='1'?'open':'closed';}
 function restoreChatURL(){const id=new URL(location.href).searchParams.get('chat');if(chats.some(c=>c.id===id))activeId=id;render();syncHistoryMode();}
 function describe(message,text=null){
  const clone=message.cloneNode(true);clone.querySelectorAll('header,button,.role,.message-reactions,[data-agent-ui]').forEach(el=>el.remove());
  const messageId=message.id||message.dataset.agentMessageId||'';
  const excerpt=(text||clone.textContent).replace(/\s+/g,' ').trim();
  const url=new URL(location.href);url.search='';url.hash=message.id||'';
  return {lessonId:lesson?.id,lessonTitle:lesson?.title,messageId,href:url.pathname+url.hash,author:message.querySelector('.sender')?.textContent||'Из урока',text:excerpt.length>1800?excerpt.slice(0,1800)+'…':excerpt,selection:!!text};
 }
 function chatFor(message){return chats.find(c=>c.source?.lessonId===lesson?.id&&c.source?.messageId===message.dataset.agentMessageId);}
 function updateTriggers(){
  for(const trigger of reader.querySelectorAll('[data-agent-thread-toggle]')){
   const message=trigger.closest('.message'),chat=chatFor(message),count=chat?.messages.length||0,open=contextTarget===message;
   const ending=count%10===1&&count%100!==11?'сообщение':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'сообщения':'сообщений';
   const title=open?'Свернуть обсуждение':count?`${count} ${ending}`:chat?.draft?'Черновик обсуждения':'Обсудить';
   const label=trigger.querySelector('.agent-thread-label');if(label.textContent!==title)label.textContent=title;
   trigger.setAttribute('aria-expanded',String(open));trigger.setAttribute('aria-label',open?'Свернуть обсуждение с агентом':`Обсудить сообщение с агентом${count?': '+title:''}`);
   trigger.dataset.hasReplies=String(!!(count||chat?.draft));
  }
 }
 function animateThread(open,done){
  const from=viewportRect(thread).height/interfaceScale();
  threadMotion?.cancel();const revision=++threadRevision;threadMotion=null;
  thread.style.height='';thread.style.overflow='';thread.style.marginBottom='';
  if(!motion?.enabled()){done();return;}
  const height=viewportRect(thread).height/interfaceScale(),margin=getComputedStyle(thread).marginBottom;
  thread.style.height=(open?0:from)+'px';thread.style.overflow='clip';thread.style.marginBottom=open?'0px':margin;
  const collapsed={height:'0px',opacity:0,marginBottom:'0px'},expanded={height:(open?height:from)+'px',opacity:1,marginBottom:margin};
  const ticket=threadMotion=motion.frame(thread,open?[collapsed,expanded]:[expanded,collapsed],{kind:'fold'});
  ticket.finished.then(()=>{if(revision!==threadRevision)return;ticket.cancel();threadMotion=null;thread.style.height='';thread.style.overflow='';thread.style.marginBottom='';done();});
 }
 function openContext(message,text=null){
  if(!agentEnabled())return;
  if(contextTarget===message&&!text){closeContext(true,true);return;}
  if(contextTarget)closeContext(false);
  const source=describe(message,text),previous=chatFor(message);
  if(previous){activeId=previous.id;if(text||!previous.messages.length)previous.pendingSource=source;}else makeChat(source);
  contextTarget=message;returnOffset=viewportRect(message).top;onContextChange(true);render();hideSelection();getSelection()?.removeAllRanges();
  message.after(thread);thread.hidden=false;
  animateThread(true,()=>{if(contextTarget!==message)return;contextWidget.input.focus({preventScroll:true});contextWidget.input.scrollIntoView({block:'nearest',behavior:motion?.enabled()?'smooth':'instant'});});
 }
 function closeContext(restore=true,animate=false){
  const target=contextTarget;if(!target)return;
  const finish=()=>{
   contextTarget=null;thread.hidden=true;document.body.append(thread);updateTriggers();
   if(restore&&target.isConnected){scrollBy(0,viewportRect(target).top-returnOffset);target.querySelector('[data-agent-thread-toggle]')?.focus({preventScroll:true});}
   onContextChange(false);
  };
  if(animate)animateThread(false,finish);
  else{++threadRevision;threadMotion?.cancel();threadMotion=null;thread.style.height='';thread.style.overflow='';thread.style.marginBottom='';finish();}
 }
 function decorate(root){
  if(!lesson||!(root instanceof Element))return;
  const messages=[...(root.matches('.message')?[root]:[]),...root.querySelectorAll('.message')];
  for(const message of messages){
   if(!message.closest('#messages,#participant-prelude')||message.querySelector('[data-agent-thread-toggle]')||!message.querySelector('.message-meta'))continue;
   message.dataset.agentMessageId=message.id||'conversation-'+(++serial);
   const discuss=button('','ui-button-ghost agent-thread-toggle');discuss.innerHTML=replyIcon+'<span class="agent-thread-label"></span><span class="agent-thread-chevron" aria-hidden="true">›</span>';discuss.dataset.agentThreadToggle='';discuss.dataset.agentUi='';
   discuss.setAttribute('aria-controls','lesson-agent-thread');
   discuss.addEventListener('click',()=>openContext(message,selection?.message===message?selection.text:null));message.append(discuss);
  }
  updateTriggers();
 }
 const selectionAsk=button('','ui-button-ghost selection-discuss');selectionAsk.innerHTML=replyIcon+'<span>Обсудить фрагмент</span>';selectionAsk.hidden=true;selectionAsk.dataset.agentUi='';document.body.append(selectionAsk);
 selectionAsk.addEventListener('pointerdown',event=>event.preventDefault());selectionAsk.addEventListener('click',()=>{if(selection)openContext(selection.message,selection.text);});
 function hideSelection(){clearTimeout(selectionTimer);selectionAsk.hidden=true;selection=null;}
 function selected(){
  if(!lesson||contextTarget||!agentEnabled()||document.body.dataset.appView!=='read'){hideSelection();return;}
  const range=getSelection();if(!range?.rangeCount||range.isCollapsed){hideSelection();return;}
  const first=range.anchorNode?.parentElement?.closest('.message'),last=range.focusNode?.parentElement?.closest('.message');
  if(!first||first!==last||!first.querySelector('[data-agent-thread-toggle]')){hideSelection();return;}
  const text=range.toString().trim();if(text.length<3){hideSelection();return;}
  const rect=viewportRangeRect(range.getRangeAt(0)),scale=interfaceScale();
  if(rect.bottom<=((document.querySelector('.lesson-toolbar')?viewportRect(document.querySelector('.lesson-toolbar')).bottom:0)||0)||rect.top>=innerHeight){hideSelection();return;}
  selection={message:first,text};selectionAsk.hidden=false;
  const width=selectionAsk.offsetWidth,height=selectionAsk.offsetHeight,top=Math.min(innerHeight/scale-height-8,Math.max(((document.querySelector('.lesson-toolbar')?viewportRect(document.querySelector('.lesson-toolbar')).bottom:0)||0)/scale+4,rect.bottom/scale+8));
  selectionAsk.style.left=Math.max(8,Math.min(innerWidth/scale-width-8,rect.right/scale-width))+'px';selectionAsk.style.top=top+'px';
 }
 if(lesson){
  decorate(reader);new MutationObserver(records=>{for(const record of records)for(const child of record.addedNodes)decorate(child);if(contextTarget&&!contextTarget.isConnected)closeContext(false);}).observe(reader,{childList:true,subtree:true});
  document.addEventListener('selectionchange',selected);addEventListener('scroll',()=>{selectionAsk.hidden=true;clearTimeout(selectionTimer);selectionTimer=setTimeout(selected,120);},{passive:true});
 }
 document.addEventListener('click',event=>{if(contextTarget&&event.target.closest('[data-view-nav],[data-read-return],[data-view-back]'))closeContext();},true);
 document.addEventListener('unknowntalks:view',event=>{if(event.detail.name!=='read')closeContext(false);if(event.detail.name==='agent')restoreChatURL();hideSelection();});
 document.addEventListener('unknowntalks:preferences',()=>{if(!agentEnabled()){closeContext();hideSelection();}render();});
 addEventListener('resize',hideSelection,{passive:true});
 addEventListener('popstate',()=>{closeContext(false);restoreChatURL();});
 addEventListener('storage',event=>{if(event.key===storageKey){const incoming=stored();chats=incoming.chats;render();}});
 render();syncHistoryMode();
}
