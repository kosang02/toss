# Recon map: DOKDO / 독도까지(배 키우기) (Android, iOS → web)

Scope: the full single-player game loop: sail, fight, capture islands, fish, trade, upgrade, assistants, arena, two oceans, boss.
For: personal play. The original was discontinued and its store pages are gone.
Date: 2026-10-10

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | Hungryapp game DB | https://m.monawa.com/game/game_view.php?gcode=7770 | dev Zzoo, released 2017-10-10, simulation genre |
| 2 | Hungryapp 게임소개 post | https://m.monawa.com/bbs/bbs_view.php?pid=1&bcode=dokdogogo | official pitch: fishing + sea battles → gold → upgrade parts; "watch out for the octopus"; expand the map to DOKDO; GooglePlay leaderboards |
| 3 | Hungryapp screenshots | https://m.monawa.com/bbs/bbs_view.php?pid=2&bcode=dokdogogo | 5 store shots → `screens/s1-s5.png` |
| 4 | Hungryapp download post | https://m.monawa.com/bbs/bbs_view.php?pid=3&bcode=dokdogogo | com.zzoo.dokdo, iOS id1286984847 |
| 5 | RAWG | https://rawg.io/games/dokdo | publisher Dalmoon; Pacific + Atlantic; arena; strong octopus |
| 6 | dokdo.online guide (fan rebuild) | https://dokdo.online/guide/ | controls, 5 upgrade tracks, body caps the others, assistants (seagull heal, Nessy max HP), arena waves, island defense fleets, market restocks |
| 7 | dokdo.online images | https://dokdo.online/ | `screens/online-*.jpg`: compass HUD, drag-teardrop control, island menu (Dock/Market/Assistant/Store), market rows |
| 8 | APK mirrors | https://apkcombo.com/dokdo/com.zzoo.dokdo/ | last version 1.16.6, 5M–10M installs, ~4.3 rating |
| 9 | YouTube gameplay | https://www.youtube.com/watch?v=Kr2q4OWXvnQ | not watched (no video access) |

## Core loop

Sail out → sink ships or fish → bring cargo and coins back to a captured island → sell, then upgrade the ship → capture the next, harder island → reach Dokdo.

## Screens

| ID | screen | how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Title | launch | logo "DOKDO", tap to start | logo ribbon, ship | — |
| S02 | Sea (main) | after title | sail, fight, fish | 3D sea, ship, resource HUD top-left, compass minimap top-right with zoom, drag teardrop, HP bar | sailing, combat, fishing available, low HP |
| S03 | Island menu: Dock | dock at a captured island | repair, upgrade ship parts | tab bar, part rows (body/sail/steering/cannon/fishing), cost, level | can afford, not enough, maxed, capped by body |
| S04 | Island menu: Market | tab | trade 6 goods | rows: icon+stock, BUY price, SELL price / NOT ENOUGH, reset timer, hold to auto-buy/sell | in stock, sold out |
| S05 | Island menu: Assistant | tab | buy/level helpers | helper cards | locked, owned |
| S06 | Island menu: Store | tab | IAP gems in original | — | skip (no money) |
| S07 | Island capture | approach uncaptured island | defend fleet appears, clear to capture | banner, enemy count | in progress, captured reward |
| S08 | Sunk / revive | HP 0 | lose cargo, respawn at last island | dialog | — |
| S09 | World map | map icon | see oceans, islands, captured state | big map | — |
| S10 | Arena | sail into arena gate | wave survival | wave counter, record | in progress, result |
| S11 | Fishing | near own island, no enemies | fishing control | fish button / progress | catching |

## Flows

```
F01 First voyage
    S01 -> S02 drag to sail -> enemy boat -> broadside kills -> loot -> S02
F02 Upgrade
    S02 dock at own island -> S03 pick part -> pay coins+goods -> level up
F03 Capture island
    S02 approach -> S07 defenders spawn -> sink all -> captured, reward, new dock
F04 Trade run
    S04 buy cheap goods at island A -> sail -> S04 sell at island B where price is higher
F05 Fishing
    S02 near own island -> S11 fish -> fish cargo -> sell
F06 Death
    HP 0 -> S08 -> respawn at last captured island, cargo lost
F07 Arena
    S10 enter gate -> waves of pirates -> rewards scale with kills
F08 Next ocean
    capture all islands of ocean 1 -> unlock ocean 2 (Atlantic) -> final: Dokdo, Kraken boss
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Resource HUD | coins, fish, wood, ore, silver, gold, gem | count | S02-S05 |
| Compass minimap | zoom toggle | — | S02 |
| Drag teardrop | — | active | S02 |
| Menu tab | Dock/Market/Assistant/Store | selected | S03-S06 |
| Row button | BUY (blue), SELL (green), NOT ENOUGH (dark green) | enabled, disabled | S03-S05 |
| HP bar over ship | player, enemy | — | S02 |
| Toast | reward, capture, level-up | — | all |

## Inferred data model

```
Player   coins, cargo{fish,wood,ore,silver,gold,gem}, hp, levels{body,sail,steer,cannon,fish},
         assistants{id:level}, captured[], lastIsland, ocean, arenaBest[ocean]
         evidence: S04 HUD, guide upgrade tracks; confidence: high
Island   id, name, ocean, pos, tier, defenders, reward, market{price,stock}, captured
         evidence: S07, S04 ("Black & White" island name); confidence: medium
Enemy    type (boat, frigate, warship, dragon ship, octopus), hp, dmg, speed, loot
         evidence: s2-s5 shots, pitch text; confidence: medium
```

## Feature matrix

See `features.csv`.

## Out of scope

- Zzoo's 3D models, textures, logo and sounds. Every model is rebuilt from primitives in code.
- Google Play leaderboards, ads (the video button on the reset timer), IAP store.
- Exact original numbers (prices, HP, costs): not public; tuned by hand.

## Size

Screens 11, flows 8, entities 3. Hard parts: 3D low-poly look in the browser, broadside combat feel, balance curve. Size: M, first playable version in one pass.
