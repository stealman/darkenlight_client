# Windows desktop

Tauri wraps the Vue/Babylon client; the game server remains separate.

Prerequisites: Node/Yarn, Rust stable MSVC, C++ Build Tools (Desktop C++) and
WebView2. Run from the client directory:

```powershell
yarn.cmd install
yarn.cmd tauri:dev
yarn.cmd tauri:build
```

Installer output: `src-tauri/target/release/bundle/nsis/`.
Version/settings: `src-tauri/tauri.conf.json`; native behavior:
`src-tauri/src/lib.rs`. Do not commit `src-tauri/target`.

The installed EXE creates a JSON file named `config` beside itself. Close the
game to change `serverUrl` (default `wss://darkenlight.net/ws`); window state
is managed there automatically. Older `server-config.json` is migrated.

Tauri builds disable PWA service workers to avoid stale WebView clients.
Validate desktop changes with `yarn.cmd tauri:build`; Rust formatting with
`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`.
