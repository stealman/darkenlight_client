# Windows desktop

Windows Tauri EXE delivery is the primary target. GM world authoring runs through
`yarn dev` in the browser and does not require Tauri.

Prerequisites: Node/Yarn, Rust stable MSVC, C++ Build Tools (Desktop C++), WebView2,
and installed dependencies in both sibling projects. Run from the client directory:

```powershell
yarn.cmd tauri:build
yarn.cmd test:runtime:desktop
```

The build exports the local Mongo world and source PNG maps before packaging.
Save and close GM authoring first. To use an already exported world without
MongoDB during the build, set `DARKENLIGHT_WORLD_BUNDLE` to that bundle directory.

Installer output: `src-tauri/target/release/bundle/nsis/`.
Release executable: `src-tauri/target/release/darkenlight.exe`.
Version/settings: `src-tauri/tauri.conf.json`; native behavior:
`src-tauri/src/lib.rs`. Do not commit `src-tauri/target`.

The installed game contains the simulation worker and world assets. It needs
no separate Node.js installation, MongoDB or game server. Native saves live
under the Tauri application data directory in `saves/`, with small character
selection records in `profiles/`. Saves contain character state and ID counters,
not world definitions. Each character has its own slot. Window settings use
`config` beside the executable. The legacy `serverUrl` setting does not select
the transport for local play.

The desktop runtime check starts its own test instance, creates a synthetic
character in a separate save slot, checks packaged worker communication and
world loading, minimizes/restores, and verifies native save/load and shutdown.
It does not use the normal save slot. An optional report path can be passed to
`build/testDesktopRuntime.ps1` with `-ReportPath`.

Tauri builds disable PWA service workers to avoid stale WebView clients.
Rust formatting: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`.
