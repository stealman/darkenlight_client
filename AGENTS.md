# Client notes

- TypeScript, Vue, Babylon.js. Keep gameplay logic in TypeScript managers and Vue
  components thin. Prefer focused changes and existing managers.
- Use PowerShell `Get-ChildItem` / `Select-String` for searches.
- `src/main.js` dispatches to `gameMain.js` or the offline `adminUtils` sandbox.
  The sandbox must not initialize networking.
- Startup: `App.vue`, `GameManager.ts`; renderer: `src/babylon/scene/renderer.ts`.
  State: `src/data`; input: `src/controlls`; UI: `src/vue/views`, `src/gui`.
- Preserve thin instances, viewport filtering and tile/data-driven world refresh.
  Avoid allocations and broad refactors in frame/overlay/entity update paths.
- Read local `src/babylon/world/AGENTS.md` or `src/babylon/item/AGENTS.md` for
  rendering changes. [Asset workflow](../docs/EQUIPMENT_ASSET_WORKFLOW.md).
- Reuse `GameDialog`, existing UI classes and semantic tokens from
  `public/styles/theme.css`. Shared colours belong there, not in local RGB copies.
  Flag unexpectedly bloated CSS before a broader cleanup.
- Protocol: `src/network/messages.ts`, `messageIfs.ts`, `messageProcessor.ts`;
  coordinate changes with the server. Inspect both sides instead of guessing.
- Full type-check has known project-wide errors; use focused validation.
  Do not build merely for CSS changes. Check mobile UI on a real device.
- Use code for current behavior; keep docs short and avoid session handoffs.
