import {gear} from './mechanism-markup.mjs';
export function renderMobileNavigation(){
 return `<div class="mobile-menu-dock"><svg viewBox="0 0 92 108" aria-hidden="true" class="mobile-menu-gears"><defs>
 <linearGradient id="nav-gear-steel" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#41474b"/><stop offset=".46" stop-color="#22272b"/><stop offset="1" stop-color="#111416"/></linearGradient>
 <linearGradient id="nav-case-edge" x1="0" y1="0" x2="1" y2=".8"><stop stop-color="#555b5e"/><stop offset=".34" stop-color="#282d30"/><stop offset="1" stop-color="#101315"/></linearGradient>
 <radialGradient id="nav-case-well" cx="24%" cy="8%" r="100%"><stop stop-color="#14191c"/><stop offset=".6" stop-color="#0b0e10"/><stop offset="1" stop-color="#050708"/></radialGradient></defs>
 <circle cx="98" cy=".2" r="22" fill="#090c0e" stroke="#30373a" stroke-width=".7"/>
 <g transform="translate(98 .2)"><g class="menu-gear menu-gear-small"><g transform="scale(.625)">${gear(32,16,'nav-gear',3,true)}</g></g></g>
 <circle cx="83" cy="35" r="20" fill="#090c0e" stroke="#30373a" stroke-width=".7"/>
 <g transform="translate(83 35)"><g class="menu-gear menu-gear-middle"><g transform="scale(.625)">${gear(28,14,'nav-gear',4,true)}</g></g></g>
 <circle cx="40" cy="56" r="34" fill="url(#nav-case-well)" stroke="url(#nav-case-edge)" stroke-width="1.1"/>
 <circle cx="40" cy="56" r="32" fill="none" stroke="#242c30" stroke-width=".6"/>
 <g transform="translate(40 56)"><g class="menu-gear menu-gear-main"><g transform="scale(.625)">${gear(48,24,'nav-gear',5,true)}</g></g></g>
 </svg><button type="button" class="mobile-menu-open ui-button-ghost" aria-label="Открыть меню" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded="false"><span class="mobile-menu-symbol" aria-hidden="true"><svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="10"/><path d="M10 10h8m-8 4h8m-8 4h8"/></svg></span><span class="mobile-menu-caption">Меню</span></button></div>
 <dialog id="mobile-navigation" class="mobile-navigation" aria-labelledby="mobile-menu-title" autofocus><section class="mobile-menu-sheet"><span class="mobile-menu-rack" aria-hidden="true"></span><header class="mobile-menu-heading"><span class="mobile-menu-handle" aria-hidden="true"></span><p class="mobile-menu-kicker">UnknownTalks</p><h2 id="mobile-menu-title" tabindex="-1">Меню</h2><button type="button" class="mobile-menu-close ui-button-ghost" aria-label="Закрыть меню">×</button></header><div class="mobile-menu-content"></div><div class="mobile-menu-clearance" aria-hidden="true"></div></section></dialog>`;
}
