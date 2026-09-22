# Darkenlight desktop client (Tauri)

## Purpose

The Tauri application is a Windows wrapper around the existing Vue/Babylon
client. It does **not** embed the game server or alter the WebSocket protocol.
The regular browser/PWA build remains supported alongside it.

## Project layout

- `src-tauri/tauri.conf.json` - Tauri build settings, main-window defaults,
  dark native title bar, CSP, icon list and NSIS installer target.
- `src-tauri/src/lib.rs` - native Rust integration: local configuration,
  window-size restore/persistence and native fullscreen commands.
- `src/network/connector.ts` - asks the Tauri backend for the server URL when
  running in the desktop wrapper; browser builds retain their existing URL
  behaviour.
- `src/babylon/scene/renderer.ts` and `src/App.vue` - native fullscreen is
  toggled by the upper-bar icon, `F11` or `Alt+Enter`. `Esc` remains a game
  input and must not leave fullscreen.
- `src/pwa/register.ts` / `src/pwa/registerDesktop.ts` and `vite.config.js` -
  PWA service workers are enabled for web builds but disabled for the `tauri`
  build mode. This prevents a WebView cache from serving a stale client after
  an installer update.

## Per-install configuration

On its first launch, the installed `darkenlight.exe` creates a file named
`config` in the same directory. It is JSON despite having no filename
extension:

```json
{
  "serverUrl": "wss://darkenlight.net/ws",
  "window": {
    "width": 1280,
    "height": 720,
    "maximized": false
  }
}
```

`serverUrl` can be changed locally to another `ws://` or `wss://` endpoint
while the game is closed. The `window` object is managed by the application
when its window closes; it records size and maximized state. Do not edit it
unless troubleshooting.

Older installations using `server-config.json` are migrated to `config` on
first launch of a current installer.

## Prerequisites

The developer machine needs:

- Node.js and the project's Yarn dependencies (`yarn install`);
- Rust stable with the MSVC toolchain (`rustup default stable-msvc`);
- Microsoft C++ Build Tools with *Desktop development with C++*;
- Microsoft Edge WebView2 Runtime.

Check the environment from `client/darkenlight_client` with:

```powershell
yarn tauri info
```

## Creating a new installer

Run these commands from `client/darkenlight_client`:

```powershell
yarn install
yarn tauri:build
```

`tauri:build` first runs `yarn build:tauri` (`vite build --mode tauri`) and
then creates the x64 NSIS installer. The expected result is:

```text
src-tauri\target\release\bundle\nsis\Darkenlight_1.0.0_x64-setup.exe
```

The version in that filename comes from `src-tauri/tauri.conf.json`; change it
there when publishing a new release. `src-tauri/target/` is build output and
is not committed.

For desktop development with hot reload, use:

```powershell
yarn tauri:dev
```

## Validation

After Tauri or frontend changes, the normal validation is:

```powershell
yarn tauri:build
```

It verifies the Vue production build, compiles the Rust wrapper, and produces
the NSIS installer. For Rust formatting only:

```powershell
cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
```
