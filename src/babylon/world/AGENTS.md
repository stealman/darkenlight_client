# World Rendering Notes

## Scope
- This folder contains world-space rendering systems for terrain, trees, statics, foliage, ground items, and related scene helpers.
- `WorldRenderer.renderWorld()` is the high-level entry point for rebuilding visible world geometry around the player.
- World rendering is not per-frame. It is refreshed when player movement crosses to a different tile / when world data updates arrive.

## Current Render Flow
- `WorldRenderer.initialize(...)` creates shared world parent nodes and initializes managers such as:
  - `TerrainManager`
  - `TreeManager`
  - `StaticsManager`
  - `FoliageManager`
- `WorldRenderer.renderWorld()` currently does:
  - clear reusable world buffers
  - render terrain
  - render trees
  - render statics
  - render decorative foliage
  - upload thin-instance buffers for shared block meshes

## Terrain Conventions
- Terrain base mesh rendering lives in `terrainManager.ts`.
- Terrain uses two representations:
  - full blocks for visible block sides / height filling
  - top planes for flat areas where only the upper face is needed
- `planeBlockMap` means "render only the upper plane here".
- `MapBlock.totalHeight` already includes `heightOffset`.
- Snow currently contributes `0.1` height through `MapBlock.getRenderedHeightOffset()`.

## Materials / UV Atlas Conventions
- World atlas-style thin-instance materials use a custom `uvc` vertex attribute.
- For atlas-offset rendering, material setup must include:
  - `AddAttribute("uvc")`
  - `Vertex_Definitions(...)`
  - `Vertex_Before_PositionUpdated(...)`
  - `Vertex_After_WorldPosComputed(...)`
- Important: `uvc` values are tile offsets in atlas-cell units, not normalized 0..1 offsets.
- Atlas scaling is handled on the texture itself via `uScale` / `vScale`.
- Comparing terrain types by UV is unsafe because multiple terrain variants can share UVs.
- If terrain filtering logic matters, compare by terrain index, not UV.

## Foliage Notes
- Decorative foliage is intentionally client-side only. It does not come from server data.
- Foliage placement is deterministic from `worldId + x + z + salt`.
- This keeps foliage stable when revisiting the same place without storing explicit instance data.
- Foliage is rendered only during `renderWorld()`, not every frame.
- Foliage currently:
  - uses thin instances
  - uses an 8x8 atlas in `public/images/materials/foliage.png`
  - supports configurable terrain-to-row mapping
  - selects atlas column deterministically
- Snow handling for foliage:
  - foliage should visually sink into snow
  - current behavior subtracts `0.1` from `block.totalHeight` when `block.snowed`
- Foliage planes:
  - small alpha-cutout meshes can suffer from texture edge artifacts
  - `Texture.CLAMP_ADDRESSMODE` on both axes fixed wrap bleeding from opposite texture edges
- Foliage shadow casting:
  - adding the foliage mesh as shadow caster did not visibly work
  - likely due to very thin plane geometry combined with shadow settings such as `forceBackFacesOnly`
  - do not assume failure is caused by alpha material alone

## Trees / Statics
- Trees and statics already follow the folder's common pattern:
  - store logical objects
  - filter by viewport
  - render into prefab thin-instance buffers
- Tree leaves / shrubs use alpha materials from shared material systems rather than ad-hoc per-object materials.

## Practical Rules For Future Changes
- Prefer deterministic generation for non-gameplay decorative content.
- Prefer thin instances and shared prefabs over one-mesh-per-object.
- Keep world refresh work tied to `renderWorld()` unless a feature truly needs per-frame updates.
- Reuse existing terrain/atlas patterns before inventing new material systems.
- When something visually disappears after atlas work, first verify:
  - texture scaling
  - `uvc` offset units
  - row direction
  - clamp vs wrap
