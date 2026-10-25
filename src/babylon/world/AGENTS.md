# World rendering

- Rebuild visible geometry through `WorldRenderer.renderWorld()` on tile/data
  changes, not every frame. Reuse shared prefabs, buffers and thin instances.
- `MapBlock.totalHeight` already includes its rendered height offset.
  `planeBlockMap` means only the upper face is required.
- Atlas `uvc` values are cell offsets; texture `uScale/vScale` applies scaling.
  Reuse the existing shader hooks in `materials.ts`. Compare terrain by type
  index, not UV (variants can share UVs).
- Decorative foliage is client-only and deterministic by world/tile/salt.
  Preserve viewport filtering and shared alpha materials.
- For atlas artifacts check scale, cell units, row direction and clamp/wrap.
  Do not assume alpha material alone explains missing shadows.
