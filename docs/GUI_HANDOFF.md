# Darkenlight GUI handoff

Tento dokument je pracovní kontext pro další AI session, která bude upravovat GUI klienta. Popisuje současný vizuální jazyk, hlavní vlastnictví kódu a rozhodnutí, která je potřeba zachovat.

## Vizuální jazyk

Darkenlight používá tmavý kamenný panel s teplým světlým horním headerem. Obsah dialogu zůstává tmavý; světlý má být jen jeho horní header, nikoliv celé modální okno.

- Základní barvy a sdílené styly jsou v `public/styles/theme.css`.
- Nejprve se znovu používá existující CSS proměnná. Nová proměnná patří do `theme.css` pouze tehdy, když je skutečně sdíleným významovým odstínem.
- Nezavádět lokální, téměř stejné RGB odstíny pro jednotlivé komponenty.
- Gradient textu se dělá třídou `.ui-text-gradient`. Stoupá od tmavšího `--ui-dark` ke světlému `--ui-base`.
- Pro hover/aktivní tlačítka se používá `.ui-text-gradient--button-state`. Samotný gradient se aktivuje globálně na `:hover` nebo `.selected`.
- Aktivní záložka/tlačítko: tmavší kamenné pozadí + gradientní text. Neaktivní záložka: světlé kamenné pozadí + tmavý text.
- Hover běžného `.dialog-button` je už globálně sjednocený: tmavší kamenné pozadí a gradientní text. Nové dialogové akce mají používat tuto třídu místo vlastního vzhledu.
- Většina interaktivních prvků používá herní kurzory (`/images/cursor.png` a `/images/cursor-pointer.png`), ne browserový pointer.

### Důležité barevné tokeny

| Význam | Token |
| --- | --- |
| Světlé UI písmo | `--ui-base` |
| Tmavé UI písmo | `--ui-dark` |
| Pozadí a velmi tmavé plochy | `--ui-darkest` |
| Modrá aktivní/platná hodnota | `--ui-accent-blue` |
| Zelená DEX / OK hodnota | `--ui-attribute-agility` |
| Obecná success zelená | `--ui-success` |
| Červená STR / kritická hodnota | `--ui-accent-red`, případně `--ui-danger` |
| Durability warning/danger | `--ui-durability-*` |

Příklady: validní label přihlašovacího inputu používá `--ui-accent-blue`; text ve vstupních polích loginu používá zelenou `--ui-attribute-agility`.

## Základ dialogů

`src/vue/views/GameDialog.vue` je společný Vue obal. Jeho struktura je:

```text
.dialog-backdrop
  .dialog-window
    .dialog-surface
      .dialog-header       (slot `header`, pokud existuje)
      .dialog-content      (default slot)
```

Globální základ je v `public/styles/theme.css`:

- `.dialog-backdrop`, `.dialog-window`, `.dialog-surface`
- `.dialog-header`
- `.dialog-content`
- `.dialog-actions`, `.dialog-button`
- `.dialog-header .tab-item`
- `.ui-text-gradient`, `.ui-progress-fill-gradient`

Nový dialog má začít přes `GameDialog` a svoje rozměry/rozložení dát do konkrétní komponenty. Neduplikovat globální button/tab vzhled. Pokud se řeší modál jako potvrzení, loading nebo chyba, platí stejný tmavý povrch a kamenný header jako u ostatních dialogů.

### Běžné vzory

- Sekce uvnitř dialogu se oddělují jemnou horizontální čárou, například `border-top: 1px solid rgba(176, 143, 86, 0.5)`. Ne přidáváním dalšího světlého kamenného headeru.
- U seznamů položek se nenechávají bezdůvodné horní/spodní bordery nad prvním a pod posledním řádkem.
- Čísla a názvy, které představují důležitou hodnotu, mají stejný gradient jako ostatní hodnoty v UI.
- Vždy ověřit, zda lokální CSS nepřebíjí později načtené globální pravidlo. U inputů je globální selektor `.dialog-content input[...]` dost specifický; lokální výjimky proto psát cíleně, např. `.login-dialog-content .login-field input[type="text"]`.

## Mapa GUI souborů

| Oblast | Primární soubory | Poznámka |
| --- | --- | --- |
| Globální theme a dialogy | `public/styles/theme.css` | Tokeny, gradienty, buttons, tabs, modály, fade-in. |
| Inventář a item sloty | `public/styles/inventory.css`, `src/vue/views/inventory/*` | Inventář, equip, pulz vybraného itemu, tooltip. |
| Item tooltip | `src/vue/views/inventory/itemInfoOverlay.vue`, `public/styles/tooltip-overlay.css`, `src/gui/tooltipOverlayManager.ts` | Název i hodnoty atributů používají gradient; durability má stejné barvy jako oprava. |
| NPC dialog | `src/vue/views/npc/NpcUseDialog.vue` | Vendor, bank, repairer, healer a jejich společné styly. |
| Banka | `src/vue/views/npc/BankPanel.vue` | Přepínače, nadpis Banka, tooltip v pravém panelu musí zůstat uvnitř dialogu. |
| Trénér/povýšení | `src/vue/views/npc/NpcTrainerPanel.vue` | Promoce, splněné/nesplněné podmínky a pulz dostupného panelu. |
| Výroba | `src/vue/views/crafting/craftingDialog.vue` | Recepty, materiály, cena, vybraný řádek a slider. |
| Character | `src/vue/views/character/*` | Vzor pro group headingy skillů a progress bary. |
| Nastavení | `src/vue/views/settingsDialog.vue` | Taby, reset, fullscreen, ovládání, device type. |
| Přihlášení | `src/vue/views/loginDialog.vue` | Specifické rozložení a mobilní/desktop režim níže. |
| Spouštění a login/logout | `src/App.vue`, `src/GameManager.ts` | Loading, canvas fade, viewport, lifecycle. |
| Dotykové ovládání | `src/vue/views/touchControllers.vue`, `src/settings/settings.ts` | Joystick a zaměřovač. |
| Canvas overlay | `src/gui/overlay/overlayManager.ts`, `src/gui/selectedTargetPanel.ts`, `public/styles/selected-target.css` | Jména, HP bary, označení cíle. |

## Dohodnuté chování NPC, inventáře a craftingu

Tyto body odpovídají současnému směru GUI; při další práci je zachovat a rozšířit stejným vzorem.

- Ceny v emeraldech: zelené číslo a ikona emeraldu, stejný font ve vendoru, healeru, craftingu i horním přehledu emeraldů. U hoveru nákupního řádku se cena pulzuje; u resource quick-buy se při hoveru `×5`/`×25` cena přepočítá.
- Názvy nabízeného zboží, craftitelných itemů a položek tooltipu mají gradient.
- Vendor/repairer/crafting při zobrazeném tooltipu pulzují světlejším filtrem na ikoně vybrané položky. Inventář a banka navíc pulzují jemným žlutým bordrem slotu.
- Tooltip se při změně vybraného craft receptu zavře, pokud uživatel neotevřel tooltip nové ikony. Tooltip bankovní položky v pravém panelu se musí posunout doleva, aby nepřetekl z dialogu.
- Repairer: status durability je progress bar jako u Skills. Číslo `current / max` je nad barem. Gradient baru jde z tmavší levé strany; plná durability je zelená. Barvy textu, baru a pozadí poškozených ikon odpovídají stejným `--ui-durability-*` tokenům jako tooltip.
- Crafting: cena vybraného receptu se násobí sliderem a pulzuje. Vybraný počet materiálu je červený a pulzuje, nevybrané zůstávají gradientně žluté. Názvy surovin mají gradient. Odstranit zbytečné okrajové bordery seznamů.
- Banka a repairer: nadpisy sekcí jsou stejné jako nadpis Banka/skill group heading (mírně větší gradient). Aktivní tabs mají tmavé pozadí a gradient; neaktivní taby světlé pozadí a tmavý text.
- Trénér: splněné podmínky zeleně, nesplněné červeně. Nezobrazovat redundantní pravý sloupec „splněno/nesplněno“, pokud existuje souhrnná hláška. Dostupná promocní karta pulzuje bordrem jako právě trénovaný skill.

## Nastavení, loading a mobilní UI

`App.vue` drží stav loginu, loadingu a herní relace. Důležité chování:

- Herní canvas, minimapa a overlay jsou skryté, dokud nezačne aktivní relace (`gameSessionActive`), potom se zobrazí fade-inem.
- Po odhlášení se svět nejdřív fade-outne, relace se vyčistí a potom se ukáže loading/login. World nesmí zůstat viditelný pod loginem.
- Loading má fáze a procenta; loading a login se pouze fade-inují, nemají vizuální fade-out.
- `App.vue` používá `window.visualViewport` a CSS proměnné `--app-viewport-height`, `--app-viewport-top`, `--login-viewport-top-inset`, `--login-viewport-bottom-inset`. Jsou důležité pro skutečné telefony s URL lištou; nenahrazovat je prostým `100vh` bez testu na zařízení.
- Dotykové ovladače se po přihlášení připojují až po zobrazení hry (`touchControlsReady`); řeší to neaktuální rozměry po fullscreenu. Joystick při prvním dotyku nesmí vyžadovat druhé klepnutí.
- Když je otevřené Nastavení → Ovládání, joystick i zaměřovač dostanou dočasně maximální z-index. Mimo tento stav zůstávají běžně v HUD.
- Obnovení defaultů resetuje pouze grafické/GUI/ovládací preference. Nesmí smazat přihlašovací údaje ani namapované akce.

## Login dialog – aktuální podoba

Soubor: `src/vue/views/loginDialog.vue`.

- Hlavní kamenný header je pouze `DARKENLIGHT` s `.ui-text-gradient`.
- Hostovská část: gradientní nadpis, field `Jméno`, pod ním stručná informace v `ui-dark`, poté jemný oddělovač.
- Účet: gradientní nadpis, stejné zarovnání a rozměry fieldů Login/Heslo, potom checkboxy a akce Přihlásit.
- Všechny tři textové fieldy mají stejnou šířku a jsou v jedné horizontální ose. Vstupy jsou o trochu vyšší, tmavé, s jemným zlatým bordrem a při focusu svítí.
- Po alespoň třech znacích se label daného fieldu přebarví na `--ui-accent-blue`. Tlačítko Přihlásit zůstává disabled, dokud neplatí alespoň jedno: jméno hosta má 3+ znaky; nebo login i heslo mají 3+ znaky.
- Checkboxy nejsou uvnitř HTML `label`u s `for`, protože by klik poslal toggle dvakrát. Jejich řádky používají obyčejný `div` a herní pointer kurzor.
- Text inputů je zelený `--ui-attribute-agility`. Přímé CSS pro `type="text"`/`type="password"` má vyšší specifitu než globální styl.

### Režim desktop vs. mobil

Rozhoduje uložené `Settings.deviceType` při vytvoření `LoginDialog`:

- `DESKTOP`: běžný dialog široký 600 px, výška podle obsahu.
- `PHONE` nebo `TABLET`: `login-dialog-window--mobile`, 80 % šířky a prakticky celá dostupná výška `visualViewport`.

Při úplně prvním startu `Settings.initialize()` používá dotykovou detekci (`ontouchstart`, `navigator.maxTouchPoints`, `navigator.msMaxTouchPoints`). Pokud dotyk existuje, nastaví `PHONE`; jinak `DESKTOP`. `TABLET` se vybírá ručně v Nastavení → Ovládání. Změna se projeví při dalším vytvoření login dialogu (obnovení nebo odhlášení/přihlášení).

## Bezpečný postup pro další úpravy

1. Nejdříve najít existující vzor v podobném dialogu a znovu použít jeho třídu/token, ne vytvořit nový vzhled.
2. Měnit malé CSS kroky a ověřit v reálné hře, hlavně na telefonu. U mobilu nestačí desktopový emulátor.
3. U CSS-only drobností nespouštět build; klient má v projektu známé globální type-check problémy a build není vizuální kontrola.
4. Nezasahovat do frame hot-pathů Babylon rendereru nebo canvas overlaye kvůli čistě Vue/CSS úpravě.
5. Před editací zkontrolovat `git status`; worktree může obsahovat nesouvisející uživatelské změny.
6. Pokud se úpravy NPC dialogů začnou výrazně opakovat, je vhodné navrhnout malou sdílenou dekompozici (např. shared price/row/section component), ale bez širokého refaktoru bez výslovného souhlasu.

