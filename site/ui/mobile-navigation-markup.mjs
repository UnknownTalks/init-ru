import {gear} from './mechanism-markup.mjs';
export function renderMobileNavigation(){
 return `<div class="mobile-menu-dock"><svg viewBox="0 0 100 150" aria-hidden="true" class="mobile-menu-gears"><defs><linearGradient id="nav-gear-steel" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#555b5d"/><stop offset=".45" stop-color="#24292c"/><stop offset="1" stop-color="#121517"/></linearGradient></defs>
 <g transform="translate(98 58.9)"><g class="menu-gear menu-gear-small">${gear(20,16,'nav-gear',3,true)}</g></g>
 <g transform="translate(82.35 93)"><g class="menu-gear menu-gear-middle">${gear(17.5,14,'nav-gear',3,true)}</g></g>
 <g transform="translate(38 110)"><g class="menu-gear menu-gear-main">${gear(30,24,'nav-gear',4,true)}</g></g>
 </svg><button type="button" class="mobile-menu-open ui-button-ghost" aria-label="Открыть меню" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded="false"><span class="mobile-menu-symbol" aria-hidden="true"><i></i><i></i><i></i></span><span class="mobile-menu-caption">Меню</span></button></div>
 <dialog id="mobile-navigation" class="mobile-navigation" aria-labelledby="mobile-menu-title"><section class="mobile-menu-sheet"><header class="mobile-menu-heading"><span class="mobile-menu-handle" aria-hidden="true"></span><p class="mobile-menu-kicker">UnknownTalks</p><h2 id="mobile-menu-title" tabindex="-1">Меню</h2><button type="button" class="mobile-menu-close ui-button-ghost" aria-label="Закрыть меню">×</button></header><div class="mobile-menu-content"></div><p class="mobile-menu-foot">Понимать модели. Работать с агентами.</p></section></dialog>`;
}
