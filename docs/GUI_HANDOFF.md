# GUI conventions

- Reuse `GameDialog.vue` and shared styles/tokens in `public/styles/theme.css`.
  Dark content, light stone header; shared button/tab appearance.
- Reuse semantic colours, gradients and durability tokens rather than adding
  near-identical component colours.
- Keep game logic in managers. Vue owns panel layout; canvas overlay lives in
  `src/gui/overlay`.
- Validate mobile viewport and touch behavior on a real device. Existing
  `visualViewport` handling must not be replaced with plain `100vh`.
- Resetting preferences must preserve credentials and mapped actions.
- Current panel behavior and detailed styles are defined by code, not this file.
