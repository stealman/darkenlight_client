# Darkenlight Client App

## Project setup
```
yarn install
```

### Compiles and hot-reloads for development
```
yarn dev
```

## Windows desktop client (Tauri)

The web/PWA client and desktop client use the same Vue build. Tauri packages
that build as a native Windows application; the game server still runs
separately.

1. Install the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/):
   Rust with the MSVC toolchain, Microsoft C++ Build Tools and WebView2.
2. On the first launch, the installed application creates `config`
   beside `darkenlight.exe`. Its default is:

   ```json
   { "serverUrl": "wss://darkenlight.net/ws" }
   ```

   Close the game, edit that file to use another `ws://` or `wss://` address,
   then start the game again. The same file also stores the last window size
   and whether the window was maximized.
4. Click the fullscreen icon in the upper bar, or press `F11` / `Alt+Enter`,
   for native fullscreen (including the title bar). Use the same control to
   leave fullscreen.
3. Use `yarn tauri:dev` while developing, or `yarn tauri:build` to create the
   Windows installer. The finished installers are written below
   `src-tauri/target/release/bundle/`.

The normal PWA build continues to use its existing same-origin `/ws`
production connection.
