# Darkenlight Client - Agent Notes

## Project Context
- This is a hobby MMORPG game client.
- Tech stack includes TypeScript, Vue, and Babylon.js.
- UI uses an overlay canvas above the 3D scene for markers/text.

## Rendering Principles
- Character and monster names are rendered in `src/gui/overlayManager.ts` in `renderNames`.
- Name/world to screen projection uses `getNameTextNodeScreenPosition()`.
- Overlay draw flow is handled in `OverlayManager.onFrame(...)`.
- Keep overlay features simple first; do not add animations unless explicitly requested.

## Combat Overlay Rules (Current)
- Monster hit feedback is rendered in the overlay as temporary floating text.
- Data source: auto-attack result (`AutoAttackResultMessage.res`).
- Show feedback for monster targets only (`tp === 'M'`) in `CharacterManager.finishAutoAttack(...)`.
- Mapping:
  - `h` -> show numeric damage.
  - `m` -> show `MISS`.
  - `b` -> show `BLOCK`.
- Lifetime: about 1 second, then remove from render list.

## Code Style Preferences (Observed)
- Prefer small, focused changes integrated into existing manager structure.
- Reuse existing manager modules (`OverlayManager`, `CharacterManager`, `MonsterManager`).
- Keep frame-time logic lightweight (`onFrame` paths must stay cheap).
- Prefer explicit early returns for invalid/missing targets.
- Keep new behavior localized and easy to tweak (duration, colors, offsets).
- Keep Vue components thin: minimal UI logic only; delegate gameplay/domain decision logic to TypeScript managers/services when it does not add unnecessary code.

## Collaboration Preferences
- Implement directly, then iterate quickly based on visual/gameplay feedback.
- Start with functional behavior first, polish later.
- Avoid introducing unrelated refactors during feature work.

## Notes
- Full `npm run type-check` currently reports many pre-existing project-wide errors.
- For small features, validate by targeted runtime behavior in-game.

## Babylon Performance Snapshot (2026-02-19)
- Overall architecture is strong for FPS:
  - Heavy usage of thin instances for terrain/statics/trees/equipment.
  - Visibility culling is integrated through `ViewportManager`.
  - Main loop work is intentionally split across frame intervals (`%2`, `%10`, `%60`, `%600`).
  - Models out of viewport are deactivated and equipment instances are detached.
- Practical result observed by author is consistent with code shape: client should scale well on mobile hardware.

## High-Impact Perf Risks To Revisit
- `src/utils/viewport.ts` `calculateViewport(...)` does many temporary allocations and repeated linear searches:
  - many `new Vector3(...)` in nested loops
  - `visibleTiles.find(...)` inside loops
  - `Frustum.GetPlanes(...)` computed per-point via `isPointInView(...)`
- Step marks and fight splats rebuild fresh thin-instance buffers every update (`%10` frames):
  - frequent `new Float32Array(...)`
  - frequent temporary matrices/quaternions during per-mark transform composition
- Character/monster model frame logic allocates temporary math objects in hot paths:
  - recurring `new Quaternion()` and `new Vector3()` in per-frame update sections
  - candidates for cached `ToRef` patterns.

## Optimization Direction (No Gameplay Change)
- Prefer object reuse in hot paths (`Vector3/Quaternion/Matrix` scratch vars).
- Prefer reusable typed arrays with capacity growth strategy over re-allocating every update.
- For viewport:
  - cache frustum planes per viewport calculation,
  - avoid per-tile `find` on `visibleTiles`,
  - consider set/hash indexing for O(1) neighbor dedup.
- Keep existing thin-instance strategy; it is a core strength of this client.
