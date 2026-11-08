import {renderViewTab} from './application-markup.mjs';
function crownRing(teeth=72){
 const points=[];
 for(let tooth=0;tooth<teeth;tooth++)for(const [phase,radius] of [[0,23.4],[.15,23.4],[.28,24.5],[.72,24.5],[.85,23.4]]){
  const angle=(tooth+phase)*Math.PI*2/teeth;points.push(`${(Math.cos(angle)*radius).toFixed(3)},${(Math.sin(angle)*radius).toFixed(3)}`);
 }
 return `<path data-teeth="${teeth}" d="M${points.join('L')}ZM19.8 0a19.8 19.8 0 1 0-39.6 0a19.8 19.8 0 1 0 39.6 0Z" fill="url(#nav-case-edge)" fill-rule="evenodd" stroke="#626b6d" stroke-width=".45"/>`;
}
export function renderMobileNavigation(){
 return `<div class="mobile-menu-dock"><button type="button" class="mobile-menu-open ui-button-ghost" aria-label="Открыть меню" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded="false"><svg viewBox="0 0 56 56" aria-hidden="true" class="mobile-menu-gears"><defs>
 <linearGradient id="nav-case-edge" x1="0" y1="0" x2="1" y2=".8"><stop stop-color="#555d60"/><stop offset=".34" stop-color="#252d31"/><stop offset=".78" stop-color="#151b1e"/><stop offset="1" stop-color="#3d464a"/></linearGradient>
 <radialGradient id="nav-case-well" cx="28%" cy="15%" r="90%"><stop stop-color="#20272a"/><stop offset=".6" stop-color="#101619"/><stop offset="1" stop-color="#090d0f"/></radialGradient></defs>
 <circle cx="28" cy="28" r="23.6" fill="url(#nav-case-well)"/>
 <g transform="translate(28 28)"><g class="menu-gear menu-gear-main">${crownRing()}</g></g>
 <circle cx="28" cy="28" r="19.3" fill="none" stroke="#404b50" stroke-width=".45"/>
 <path class="mobile-menu-lines" d="M18 21h20M18 28h20M18 35h20" fill="none" stroke="#c4c9c5" stroke-width="1.5" stroke-linecap="round"/>
 </svg></button></div>
 <dialog id="mobile-navigation" class="mobile-navigation" aria-labelledby="mobile-menu-title" autofocus><section class="mobile-menu-sheet"><header class="mobile-menu-heading"><span class="mobile-menu-handle" aria-hidden="true"></span><h2 id="mobile-menu-title" class="sr-only" tabindex="-1">Меню</h2><button type="button" class="mobile-menu-close ui-button-ghost" aria-label="Закрыть меню">×</button></header><div class="mobile-menu-content">${renderViewTab({name:'agent',label:'Агент',id:'mobile-agent-open',controls:'mechanism-agent'})}</div><div class="mobile-menu-clearance" aria-hidden="true"></div></section></dialog>`;
}
