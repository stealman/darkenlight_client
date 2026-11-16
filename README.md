# Darkenlight

The local game simulation runs in a worker. Install dependencies in both
`client/darkenlight_client` and `server/darkenlight_server`; keep the sibling
project layout. There is no root npm package.

From the client directory:

```powershell
yarn.cmd dev
```

Create `.env.local` in this directory containing `VITE_GM_MODE=true` (see
`.env.example`), then start/restart `yarn dev`. This enables the **Create a GM
character** checkbox in the local character menu. It does not automatically
select GM mode. Without the flag (and in every release), only ordinary
characters can be created or selected.

The menu lists locally created characters and starts empty. Create a character
with just a name and choose Fighter/Mystic, or select the GM checkbox. Every
character has a separate save ID; there are no account/password forms and no
characters are read from or written to MongoDB. Existing Mongo characters and
older unlisted test save slots are left untouched.

A new GM has no starter items. Its character/inventory save is local; the GM
world is loaded afresh from authoring Mongo and source PNGs on every start.
GM panel edits still persist to those authoring sources. The standalone Node
game server is not needed. Authoring requests are only accepted from this PC.

Ordinary play loads world definitions and compiled binary terrain from the
exported bundle on every start. Saves contain only character state (including
inventory, equipment and bank) and ID counters. World definitions are never copied into a save.
Additional persistent world/story changes require explicit design and are not
saved yet. Export once
before browser development play:

```powershell
yarn.cmd export:world
```

Save GM changes and close the GM session before exporting. If an active-session
error remains after closing the tab, stop the development server and retry.
Export never includes player accounts, characters or chat. Generated world data
is not committed to Git.

```powershell
yarn.cmd build
yarn.cmd tauri:build
```

Both release builds export the current local Mongo world and compile source
map PNGs first. Re-export older bundles that do not contain compiled terrain.
Rebuilding derived terrain alone preserves the source content version used by saves.
The packaged game does not require MongoDB or a game server. CI may set
`DARKENLIGHT_WORLD_BUNDLE` to an already exported bundle directory to build
without Mongo access. Keep that immutable bundle with the release artifacts.

Saves are tied to their world's content version; migration between changed
world bundles is not implemented. Browser saves use IndexedDB; desktop saves
use the application's native data directory. Use `?save=<slot>` for separate
browser playtest slots.

Checks from this directory:

```powershell
yarn.cmd test:runtime
yarn.cmd test:runtime:gm
yarn.cmd test:runtime:worker
yarn.cmd test:runtime:desktop
```

The GM check requires Chrome, local MongoDB and an exported world. It uses a
temporary database and map copies. The worker check requires a built `dist`;
the desktop check requires a built release EXE. Validate runtime TypeScript
with `npx.cmd tsc --noEmit --pretty false -p tsconfig.runtime.json`, and server
TypeScript from its own directory. The full client type-check has known errors.

The standalone Node/WebSocket entry point remains available for compatibility
checks: start it from the server directory, then open development mode with
`?transport=websocket`. It uses the configured MongoDB.

Desktop: [Tauri commands and configuration](docs/TAURI_DESKTOP.md).
Development conventions: [AGENTS.md](AGENTS.md).
