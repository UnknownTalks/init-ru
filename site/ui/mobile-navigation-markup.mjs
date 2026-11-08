import {gear} from './mechanism-markup.mjs';
export function renderMobileNavigation(){
 return `<div class="mobile-menu-dock"><svg viewBox="0 0 116 164" aria-hidden="true" class="mobile-menu-gears"><defs>
 <linearGradient id="nav-gear-steel" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#41474b"/><stop offset=".46" stop-color="#22272b"/><stop offset="1" stop-color="#111416"/></linearGradient>
 <linearGradient id="nav-case-edge" x1="0" y1="0" x2="1" y2=".8"><stop stop-color="#555b5e"/><stop offset=".34" stop-color="#282d30"/><stop offset="1" stop-color="#101315"/></linearGradient>
 <radialGradient id="nav-case-well" cx="24%" cy="8%" r="100%"><stop stop-color="#14191c"/><stop offset=".6" stop-color="#0b0e10"/><stop offset="1" stop-color="#050708"/></radialGradient></defs>
 <rect x="5" y="1" width="136" height="162" rx="42" fill="#080a0b" stroke="url(#nav-case-edge)" stroke-width="1.5"/>
 <rect x="10" y="6" width="132" height="152" rx="37" fill="url(#nav-case-well)" stroke="#343a3e" stroke-width=".7"/>
 <path d="M43 9Q14 9 14 42v73" fill="none" stroke="#838b8c" stroke-opacity=".15" stroke-width=".8"/>
 <g transform="translate(123 59)"><g class="menu-gear menu-gear-small"><g transform="scale(.625)">${gear(32,16,'nav-gear',3,true)}</g></g></g>
 <g transform="translate(108 93.8)"><g class="menu-gear menu-gear-middle"><g transform="scale(.625)">${gear(28,14,'nav-gear',4,true)}</g></g></g>
 <circle cx="64" cy="112" r="37" fill="#080b0d" stroke="url(#nav-case-edge)" stroke-width="1.1"/>
 <circle cx="64" cy="112" r="34" fill="none" stroke="#22282c" stroke-width="1"/>
 <g transform="translate(64 112)"><g class="menu-gear menu-gear-main"><g transform="scale(.625)">${gear(48,24,'nav-gear',5,true)}</g></g></g>
 <g fill="#161c1f" stroke="#454d51" stroke-width=".6"><circle cx="28" cy="36" r="2.3"/><circle cx="28" cy="56" r="2.3"/><path d="m26.8 35.6 2.4.8m-2.4 19.2 2.4.8"/></g>
 </svg><button type="button" class="mobile-menu-open ui-button-ghost" aria-label="Открыть меню" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded="false"><span class="mobile-menu-symbol" aria-hidden="true"><svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="10"/><path d="M10 10h8m-8 4h8m-8 4h8"/></svg></span><span class="mobile-menu-caption">Меню</span></button></div>
 <dialog id="mobile-navigation" class="mobile-navigation" aria-labelledby="mobile-menu-title"><section class="mobile-menu-sheet"><span class="mobile-menu-rack" aria-hidden="true"></span><header class="mobile-menu-heading"><span class="mobile-menu-handle" aria-hidden="true"></span><p class="mobile-menu-kicker">UnknownTalks</p><h2 id="mobile-menu-title" tabindex="-1">Меню</h2><button type="button" class="mobile-menu-close ui-button-ghost" aria-label="Закрыть меню">×</button></header><div class="mobile-menu-content"></div><div class="mobile-menu-clearance" aria-hidden="true"></div></section></dialog>`;
}
