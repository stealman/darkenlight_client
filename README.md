# Darkenlight

Darkenlight is currently a singleplayer game, with local cooperative multiplayer
planned. Windows Tauri EXE and the browser use the same local simulation. The
architecture migration does not redesign classes, combat, skills or progression.
The separate `darkenlight_online` repository is outside this setup.

## Architecture

- `client/darkenlight_client`: Vue interface, Babylon rendering, input and local saves.
- `server/darkenlight_server`: gameplay rules and simulation, embedded in a Web
  Worker. It starts after character selection and saves/stops on logout.
- Gameplay uses the existing message protocol and queues. Local worker and remote
  transports share that boundary; local co-op connection/UI work is still pending.
  Player movement collisions are handled by the client; AI collisions stay in the simulation.
- Release world data comes from an exported bundle. The client loads static
  terrain directly; live world changes still arrive as messages. Terrain and bot
  navigation are prepared during export. DEV/GM recalculates navigation at startup.

Keep both sibling projects and install dependencies in each; there is no root
package. Ordinary play needs neither a standalone Node server nor MongoDB.

## Development and GM authoring

Run from `client/darkenlight_client`:

```powershell
yarn.cmd export:world
yarn.cmd dev
```

Export requires local MongoDB and source map PNGs. For GM authoring, set
`VITE_GM_MODE=true` in `.env.local` (see `.env.example`) and restart `yarn dev`.
This enables the GM checkbox; it never appears in release builds. Authoring runs
in the browser on the authoring PC, using MongoDB and editable PNGs through the
local development bridge. Tauri is not needed for authoring.

Create/select local characters by name, without accounts or passwords. Each has
its own save; the menu also supports deleting a character and its save. Browser
saves use IndexedDB; desktop saves use the native app data directory. Saves hold
character state, spawn progress and counters, not the authored world definition.
Migration between changed source worlds remains undecided.

A new GM starts without equipment. Its character save is local, while each session
loads the authored world with saved spawn progress. GM world edits are saved to local MongoDB/PNGs;
existing Mongo accounts and characters are not used for local play.

## Build and try a release

Save and close GM authoring before building. From the client directory:

```powershell
yarn.cmd build
yarn.cmd serve --host 0.0.0.0 --port 4173 --strictPort
```

Open `http://<PC-LAN-IP>:4173` on a phone on the same network. This serves the
production `dist`, without the DEV server. Characters are saved on that device
and browser origin; they are not synchronized between devices.

For Windows EXE: `yarn.cmd tauri:build`. The packaged game runs without Yarn,
MongoDB or a game server. See [desktop setup](docs/TAURI_DESKTOP.md).

Both builds export the authored world, compiled terrain and navigation. To build
without Mongo access, set `DARKENLIGHT_WORLD_BUNDLE` to a complete pre-exported
bundle containing those assets. Re-export older incomplete bundles. Derived asset
rebuilds alone preserve the source content version used by saves.
Production hosting serves the complete `dist`; see the
[deployment runbook](../../deploy/PRODUCTION_DEPLOYMENT.md).

## Verification

Tests are run explicitly; ordinary development, builds and play do not launch them.

```powershell
yarn.cmd test:runtime
yarn.cmd test:runtime:gm
yarn.cmd test:runtime:worker
yarn.cmd test:runtime:desktop
```

The GM check uses Chrome, local MongoDB and isolated database/map copies. Worker
checks need a built `dist`; desktop checks need a built EXE. Runtime type-check:
`npx.cmd tsc --noEmit --pretty false -p tsconfig.runtime.json`. Server type-check,
from its directory: `npx.cmd tsc --noEmit --pretty false`. Full client type-check
has known errors. Development conventions: [AGENTS.md](AGENTS.md).

The optional legacy Node/WebSocket host remains for compatibility checks; browser
DEV can select it with `?transport=websocket`. It is not a deployed singleplayer service.
