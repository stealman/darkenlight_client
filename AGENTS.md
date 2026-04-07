# Darkenlight Client - Agent Notes

## Project Context
- Hobby MMORPG client.
- Main stack: TypeScript, Vue, Babylon.js.
- UI combines Vue panels with a canvas-based in-game overlay rendered above the 3D scene.

## Working Style
- Prefer small, focused changes inside existing manager/module boundaries.
- Reuse existing managers before introducing new abstraction layers.
- Keep hot-path frame logic cheap, especially anything called from render/update loops.
- Prefer explicit early returns for invalid state or missing targets.
- Keep Vue components thin when gameplay logic can live in TypeScript managers/services.
- For feature work, implement directly, then iterate from in-game behavior.
- For trivial string formats already defined by the server, prefer direct parsing inline over defensive helper abstractions.
- When server/message contracts are ambiguous, do not speculate; ask a clarifying question first.
- When editing UI styles, watch for bloated local CSS blocks; if a stylesheet looks unusually repetitive or oversized for the feature, call it out proactively and ask before doing a cleanup/refactor pass.

## Project Map

### Root Entry Points
- `src/main.js`: Vue/bootstrap entry.
- `src/App.vue`: top-level app shell.
- `src/GameManager.ts`: high-level game startup and cross-system orchestration.

### Rendering And World
- `src/babylon/`: Babylon scene, world rendering, models, animation, audio, characters, monsters, items.
- `src/babylon/scene/renderer.ts`: central renderer entry point.
- `src/babylon/character/`: character state, visuals, equipment, animation-related logic.
- `src/babylon/monsters/`: monster state and visuals.
- `src/babylon/world/`: terrain, map objects, ground items, world presentation.

### GUI And Overlay
- `src/gui/`: in-world UI systems that are not regular Vue panels.
- `src/gui/overlay/overlayManager.ts`: overlay draw flow for names, action labels, damage numbers, markers, target indicators.
- `src/gui/overlay/targetSelector.ts`: target selection visuals/behavior in overlay.
- Overlay labels use world-to-screen projection from entity helpers like `getNameTextNodeScreenPosition()`.

### Game Data And Rules
- `src/data/`: gameplay data, player state, actions, items.
- `src/data/actions/`: action definitions and player/character action metadata.
- `src/data/items/`: item definitions and item helpers.
- `src/gm/`: GM/debug/admin-style helpers.

### Networking
- `src/network/connector.ts`: connection transport setup.
- `src/network/messageProcessor.ts`: incoming message dispatch/handling entry.
- `src/network/messages.ts` and `src/network/messageIfs.ts`: message structures/contracts.

### Vue UI
- `src/vue/views/`: screen/panel level Vue views.
- `src/vue/pinia/`: Pinia stores.
- `src/vue/icons/`: UI icon components/assets.

### Shared Utilities
- `src/utils/viewport.ts`: visibility/viewport calculations; treat as performance-sensitive.
- `src/utils/minimap.ts`: minimap helpers.
- `src/utils/`: rendering/data utility helpers shared across systems.
- `src/controlls/`: input/control handling.
- `src/settings/`: client settings/config behavior.
- `src/i18n/`: localization resources/helpers.

## Overlay Notes
- Character and monster names are rendered in `src/gui/overlay/overlayManager.ts`, mainly in `renderNames(...)`.
- Timed action labels for characters are rendered there as part of the same label flow.
- Keep overlay features simple unless the task explicitly asks for animation or extra visual polish.

## Performance Notes
- Thin instances and viewport-based visibility are important architectural patterns here; preserve them.
- Be careful with allocations in per-frame code, especially in overlay, viewport, character, and monster update paths.
- Prefer object reuse and localized tweaks over broad refactors when optimizing.

## Validation Notes
- Full `npm run type-check` is not a reliable small-change signal because there are existing project-wide errors.
- For small gameplay/UI tweaks, prefer targeted verification and focused inspection of affected paths.

## Maintaining Agent Notes
- This file should stay short and structural.
- Update it when recurring project knowledge would help future work, not for one-off implementation details.
- Prefer documenting important entry points, ownership boundaries, and performance-sensitive areas over exhaustive file lists.
- If a subdirectory becomes large or confusing, add a local `AGENTS.md` there instead of overloading this root file.
