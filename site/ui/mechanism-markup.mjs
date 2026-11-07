// UnknownTalks watch: the selected case and engraved gear geometry.
function gear(radius,teeth,prefix,spokes=4,relief=false){
 const points=[];
 for(let tooth=0;tooth<teeth;tooth++)for(const [part,r] of [[0,radius-3],[.18,radius-3],[.28,radius+1.8],[.7,radius+1.8],[.8,radius-3]]){
  const a=(tooth+part)*Math.PI*2/teeth;points.push(`${(Math.cos(a)*r).toFixed(2)},${(Math.sin(a)*r).toFixed(2)}`);
 }
 const outline=`M${points.join('L')}Z`;
 return `${relief?`<path class="gear-side" d="${outline}" transform="translate(0 1.8)" fill="#06080a" stroke="#050608" stroke-width="1.2"/>`:''}<path class="gear-face" d="${outline}" fill="url(#${prefix}-steel)" stroke="#737881" stroke-width=".85"/>
  <circle r="${radius-8}" fill="#0b0c0e" stroke="#3d4249" stroke-width="1.2"/>
  ${Array.from({length:spokes},(_,i)=>`<path d="M-4 0L-3 ${-radius+9}Q0 ${-radius+5} 3 ${-radius+9}L4 0Z" fill="url(#${prefix}-steel)" stroke="#525760" stroke-width=".65" transform="rotate(${i*360/spokes})"/>`).join('')}
  <circle r="9" fill="url(#${prefix}-steel)" stroke="#777c84" stroke-width=".8"/><circle r="3" fill="#d7d2c2"/><path d="M-2 0h4" stroke="#37383a" stroke-width=".7"/>`;
}
export function mechanism(prefix,small=false,{relief=false}={}){
 const ticks=Array.from({length:60},(_,i)=>`<path d="M160 25v${i%5===0?7:3}" transform="rotate(${i*6} 160 160)" stroke="${i%5===0?'#8b8f96':'#40444a'}" stroke-width="${i%5===0?1.1:.8}"/>`).join('');
 const spiral=Array.from({length:150},(_,i)=>{const a=i/149*Math.PI*8,r=3+i/149*23;return `${(Math.cos(a)*r).toFixed(2)},${(Math.sin(a)*r).toFixed(2)}`;}).join('L');
 return `<svg class="mechanism ${small?'mechanism-small':'mechanism-large'}" data-mechanism viewBox="0 0 320 320" aria-hidden="true">
 <defs>
  <radialGradient id="${prefix}-case" cx="30%" cy="12%" r="94%"><stop stop-color="#34383b"/><stop offset=".48" stop-color="#181b1d"/><stop offset="1" stop-color="#07080a"/></radialGradient>
  <linearGradient id="${prefix}-steel" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="${relief?'#555b5e':'#3f444a'}"/><stop offset=".46" stop-color="#202429"/><stop offset="1" stop-color="#101215"/></linearGradient>
  ${relief?`<linearGradient id="${prefix}-rim" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="#555b5e"/><stop offset=".55" stop-color="#292e32"/><stop offset=".86" stop-color="#41484e"/><stop offset="1" stop-color="#1c2024"/></linearGradient>`:''}
  <linearGradient id="${prefix}-edge" x1="0" y1="0" x2=".75" y2="1"><stop stop-color="#8b8d8d"/><stop offset=".36" stop-color="#383c40"/><stop offset=".8" stop-color="#141619"/><stop offset="1" stop-color="#64676a"/></linearGradient>
  <radialGradient id="${prefix}-well"><stop stop-color="#0b0d0f"/><stop offset=".84" stop-color="#101316"/><stop offset="1" stop-color="#020304"/></radialGradient>
  <filter id="${prefix}-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".85"/></filter>
 </defs>
 <g class="mechanism-casing"><circle cx="160" cy="160" r="152" fill="#050607" stroke="#303438"/>
 <circle cx="160" cy="160" r="147" fill="url(#${prefix}-case)" stroke="url(#${prefix}-edge)" stroke-width="1.5"/>
 <circle cx="160" cy="160" r="120" fill="url(#${prefix}-well)" stroke="#4b5055" stroke-width=".8"/>
 <circle cx="160" cy="160" r="117" fill="none" stroke="#020304" stroke-width="3"/>
 <g class="mechanism-ticks">${ticks}</g>
 <g data-turn="index" transform="rotate(0 160 160)"><path d="M157 24h6l-1.5 10h-3Z" fill="#e5e1d1"/><path d="M160 39v6" stroke="#e5e1d1" stroke-width="1.2"/></g></g>
 <g filter="url(#${prefix}-shadow)">
  <g transform="translate(128 178)"><g data-turn="wheel">${gear(50,25,prefix,5,relief)}<path d="M0-40v6" stroke="#e5e1d1" stroke-width="1.5"/></g></g>
  <g transform="translate(211 143)"><g data-turn="transfer">${gear(40,20,prefix,4,relief)}</g></g>
  <g transform="translate(225 208)"><g data-turn="escape">${gear(25,13,prefix,3,relief)}</g></g>
 </g>
 <g transform="translate(111 93)"><g data-turn="balance">
  <circle r="37" fill="none" stroke="#111315" stroke-width="9"/><circle r="36" fill="none" stroke="#a4a399" stroke-width="1.4"/>
  <circle r="31" fill="none" stroke="#54595f" stroke-width="1.2"/>
  <path d="M-32 0h64M0-32v64" stroke="url(#${prefix}-edge)" stroke-width="4"/>
 </g><path class="mechanism-detail" data-spring d="M${spiral}" fill="none" stroke="#8b8b82" stroke-width=".65"/>
  <path class="mechanism-detail" d="M26 0h5" stroke="#8b8b82" stroke-width=".8"/><circle r="5" fill="#d2cdbc"/><circle r="2" fill="#202327"/>
 </g>
 <path d="M74 224l9-12 42-39 17 4 16 32-9 10-23-26-40 41Z" fill="url(#${prefix}-steel)" stroke="#60666d" stroke-width=".8"/>
 <circle cx="130" cy="182" r="7" fill="#16191d" stroke="#7a7e84"/><path d="m127 179 6 6" stroke="#a7a69e"/>
 <g transform="translate(190 226)"><g data-turn="lever"><path d="M-7 5 8-14l16-2 1 6-12 2L1 9Z" fill="url(#${prefix}-edge)" stroke="#85898c" stroke-width=".65"/><circle r="4" fill="#bbb9ac"/><circle r="1.6" fill="#131518"/></g></g>
 <path d="M77 65q-10 27-4 49" fill="none" stroke="#6b7178" stroke-width="2"/>
 ${[[66,67],[255,78],[257,255],[66,250]].map(([x,y])=>`<g class="mechanism-detail" transform="translate(${x} ${y})"><circle r="5" fill="url(#${prefix}-steel)" stroke="#777b80" stroke-width=".7"/><path d="m-2.5-1 5 2" stroke="#b9b8ae" stroke-width=".8"/></g>`).join('')}
 <text class="mechanism-detail" x="160" y="271" fill="#777b7f" font-family="ui-monospace,monospace" font-size="7" letter-spacing="2" text-anchor="middle">UT · 01</text>
 </svg>`;
}

export function renderMechanismButton(){
 return `<button type="button" id="mechanism-agent-open" class="lesson-mechanism" data-lesson-mechanism aria-label="Открыть ИИ-агента" aria-controls="mechanism-agent" aria-expanded="false" title="Открыть ИИ-агента"><span class="lesson-mechanism-case" aria-hidden="true">${mechanism('lesson-watch',true,{relief:true})}<span class="mechanism-heat" aria-hidden="true"></span></span><canvas class="mechanism-sparks" aria-hidden="true"></canvas></button><span id="mechanism-agent-status" class="sr-only" role="status"></span>`;
}
export function renderMechanismAgent(){
 return `<section id="mechanism-agent" class="app-view mechanism-agent" aria-labelledby="mechanism-agent-title" hidden>
  <header class="mechanism-agent-heading"><h2 id="mechanism-agent-title">ИИ-агент</h2><span>Скоро в UnknownTalks</span></header>
  <div class="mechanism-agent-message"><p class="mechanism-agent-sender">UnknownTalks <span>·</span> сообщение системы</p><p class="mechanism-agent-lead">Здесь начнётся диалог с вашим ИИ-агентом.</p><p>Можно будет задавать вопросы по уроку, находить нужные главы и работать со своими навыками прямо в разговоре.</p><p class="mechanism-agent-note">Пока агент не подключён. Урок ждёт вас на том же месте.</p></div>
  <div class="mechanism-agent-actions"><button type="button" data-read-return class="mechanism-agent-return">Вернуться к уроку <span aria-hidden="true">↩</span></button></div>
 </section>`;
}
