<p align="center">
  <a href="https://github.com/absolute2007/tosu-mix/blob/main/LICENSE" target="_blank"><img alt="License: GPL--3.0" src="https://img.shields.io/github/license/absolute2007/tosu-mix?style=for-the-badge&color=%23A27456" /></a>
  <img alt="Version" src="https://img.shields.io/github/release/absolute2007/tosu-mix.svg?style=for-the-badge&color=%235686A2" />
  <img src="https://img.shields.io/badge/node-%3E%3D20.11.1-45915E.svg?style=for-the-badge&logo=node.js&logoColor=white" />
</p>


<h1 align="center">tosu-mix</h1>
<div align="center">
  <img src=".github/logo.png" />
</div>

<br>

<p align="center">
  <img src="https://img.shields.io/github/issues/absolute2007/tosu-mix?style=for-the-badge&color=%23a35f56" />
  <img src="https://img.shields.io/github/issues-closed/absolute2007/tosu-mix?style=for-the-badge&color=%237256a3&label=" />
  <img src="https://img.shields.io/github/issues-pr/absolute2007/tosu-mix?style=for-the-badge&color=%2354935b" />
  <img src="https://img.shields.io/github/issues-pr-closed/absolute2007/tosu-mix?style=for-the-badge&color=%237256a3&label=" />
</p>

<div  align="center">
  <a href="https://github.com/absolute2007/tosu-mix/releases/latest"><img src=".github/button-download.png" /></a>
  <a href="https://github.com/tosuapp/counters/tree/master/counters"><img src=".github/button-counters.png" /></a>
</div>

<br>

```text
tosu-mix is a standalone Windows fork of tosu with an updated osu!standard PP pipeline based on the official ppy/osu calculator.
```
> [!NOTE]
> Supports stable and osu! lazer. <br> Compatible with _**gosumemory**_ and _**streamCompanion**_ overlays.
> This fork specifically fixes standard PP after the 2025 PP rework and ships a ready-to-run standalone package with bundled in-game overlay.

<br>

Installation guide
---
1. Download the latest release from [Releases](https://github.com/absolute2007/tosu-mix/releases/latest)
2. Extract `tosu-*-win-x64.zip` to any folder
3. Run `tosu.exe`
4. Open [http://127.0.0.1:24050](http://127.0.0.1:24050)
5. Configure overlays or enable the in-game overlay
---

<br>

What this fork changes
---
- [x] Uses the official `ppy/osu` calculator for `osu!standard` PP
- [x] Fixes menu PP, live gameplay PP, and result-screen PP for standard after the 2025 PP rework
- [x] Bundles the in-game overlay into the standalone Windows release
- [x] Bundles the helper required for the official PP calculator into the standalone Windows release
- [x] Keeps the original websocket and overlay compatibility
---

<br>

Features
---
- [x] All _**Gamemodes**_ are supported
- [x] `osu!standard` PP is calculated using the official `ppy/osu` ruleset implementation in this fork
- [x] gosuMemory _**compatible**_ api
- [x] streamCompanion _**compatible**_ api
- [x] Lazer support
- [X] Brand _**new api**_ for websocket
- [x] _**In-game**_ overlay, allow adding multiple overlays (pp counters)
- [x] _**Available**_ websocket data:
  - Settings
  - Gameplay data
  - User ingame data
  - Beatmap data
  - Session _**(Work in progress)**_
  - Multiple graphs for different skill sets _**(aim, speed, etc)**_
    - Extended starrating stats _**(per mode)**_
  - Leaderboards list _**(array)**_
  - Folders paths and Files names
  - Direct paths to files
  - Result screen
  - Tourney data _**(not tested, yet)**_
- [X] LOW CPU USAGE (I actually checked, this thing has a much lower memory recoil than the gosu)
---

<br>

In-game overlay
---
- Standalone releases already ship with `ENABLE_INGAME_OVERLAY=true`
- Default hotkey: `Ctrl + Shift + Space`
- You can still change overlay behavior in `tosu.env`
---


<br>

Build
---
Windows standalone release:
```powershell
corepack pnpm install
corepack pnpm build:win
```

The ready-to-run bundle will be created in:
`packages/tosu/dist/release/tosu-<version>-win-x64`

The release zip will be created in:
`packages/tosu/dist/release/tosu-<version>-win-x64.zip`
---

<br>

API
---
- `/` - List of all counters you have

gosu compatible api
- `/json` - Example of `/ws` response
- `/ws` - [response example](https://github.com/tosuapp/tosu/wiki/v1-websocket-api-response)
- `/Songs/{path}` - Show content of the file, or show list of files for a folder

streamCompanion compatible api
- `/json/sc` - Example of `/tokens` response
- `/tokens` - [response example](https://github.com/tosuapp/tosu/wiki/v1-websocket-api-response)
- `/backgroundImage` - Current beatmap background

v2 _**(tosu own api)**_
- `/json/v2` - Example of `/websocket/v2` response
- `/websocket/v2` - [response example](https://github.com/tosuapp/tosu/wiki/v2-websocket-api-response)
- `/websocket/v2/precise` - [response example](https://github.com/tosuapp/tosu/wiki/v2-precise-websocket-api-response)
- `/files/beatmap/{path}` - same as `/Songs/{path}`
- `/files/beatmap/background` - Background for current beatmap
- `/files/beatmap/audio` - Audio for current beatmap
- `/files/beatmap/file` - .osu file for current beatmap
- `/files/skin/{path}` - similar as `/files/beatmap/{path}`, but for a skin

api
- `/api/calculate/pp` - Calculate pp for beatmap with custom data
  - [Response example](https://github.com/tosuapp/tosu/wiki/api-calculate-pp-response-example)
  - BY DEFAULT IT USES CURRENT BEATMAP (:))
  - All parameters are optional
  - `path` - Path to .osu file. Example: C:/osu/Songs/beatmap/file.osu
  - `lazer` - true or false
  - `mode` - osu = 0, taiko = 1, catch = 2, mania = 3
  - `mods` - Mods id or Array of mods. Example: 64 - DT or [ { acronym: "DT", settings": { speed_change: 1.3 } } ]
  - `acc` - Accuracy % from 0 to 100
  - `nGeki` - Amount of Geki (300g / MAX)
  - `nKatu` - Amount of Katu (100k / 200)
  - `n300` - Amount of 300
  - `n100` - Amount of 100
  - `n50` - Amount of 50
  - `sliderEndHits` - Amount of slider ends hits (lazer only)
  - `smallTickHits` - Amount of slider small ticks hits (lazer only)
  - `largeTickHits` - Amount of slider large ticks hits (lazer only)
  - `nMisses` - Amount of Misses
  - `combo` - combo
  - `passedObjects` - Sum of nGeki, nKatu, n300, n100, n50, nMisses
  - `clockRate` - Map rate number. Example: 1.5 = DT
---


<br />

Support
---
- Give a ⭐️ if this project helped you!
- Open an issue in this repository if something in the fork is broken
---

<br/>

Linux notice
---
- osu! stable build tested on [osu-winello script](https://github.com/NelloKudo/osu-winello/tree/main) with arch linux 2025.03.01 (latest confirmed that all works)
- If you're using custom wine prefix with wine cwd breaking (your cwd is showing windows path instead of full linux one) please set `TOSU_OSU_PATH` in your bash/zsh profile (example `TOSU_OSU_PATH=/home/kotrik/.local/share/osu-wine/osu!`)
- osu! lazer builds tested on AppImage from official osu repository and flatpak image
---

<br/>

Sponsorship & Thank notice
---
| [![](./.github/sponsors/signpath.png)](https://signpath.io/) | Free code signing on Windows provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/) |
| :----------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------: |
| tosu-ingame-overlay | Overlay provided by [storycraft](https://github.com/storycraft) |

<br />

## Maintainers

🐱‍👓 **Mikhail Babynichev**
* _**LEADMF**_
* Website: http://kotrik.ru
* Twitter: [@kotrik0](https://twitter.com/kotrik0)
* Github: [@KotRikD](https://github.com/KotRikD)
<br>

🍒 **Cherry**
* _**Memory guy**_
* Github: [@xxCherry](https://github.com/xxCherry)
<br>

🍥 **storycraft**
* _**baking an ingame-overlay**_
* Website: https://pancake.sh
* Twitter: [@storycraft8814](https://twitter.com/storycraft8814)
* Github: [@storycraft](https://github.com/storycraft)
<br>


<br>

## 🤝 Contributing

Contributions, issues and feature requests are welcome.<br />Check the [issues page](https://github.com/absolute2007/tosu-mix/issues).

<br />

## Star History

<a href="https://www.star-history.com/#tosuapp/tosu&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=absolute2007/tosu-mix&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=absolute2007/tosu-mix&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=absolute2007/tosu-mix&type=Date" />
 </picture>
</a>

<br />

## 📝 License

Copyright © 2023-2026 [Mikhail Babynichev](https://github.com/KotRikD).<br />
This fork is distributed under [LGPL-3.0](https://github.com/absolute2007/tosu-mix/blob/main/LICENSE).
