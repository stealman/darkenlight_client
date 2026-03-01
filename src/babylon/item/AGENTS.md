# Item Rendering Notes

## Scope
- Folder: `src/babylon/item`
- Goal: quick reference for how equipable item rendering currently works.

## Runtime Pipeline (Characters/Monsters)
- Core manager: `equipManager.ts`
- `EquipManager.itemTypes` holds one source mesh per item model type (`modelId`).
- Visible equipped items are rendered as **thin instances** of that mesh:
  - matrix buffer: `"matrix"` (16 floats / instance)
  - atlas offset buffer: `"uvc"` (2 floats / instance)
- Per-frame update is in `EquipManager.onFrame()`:
  - builds world matrix from item position/rotation/scale
  - writes `uvc` atlas offsets
  - updates thin instance buffers

## Codebooks
- `codebook/weaponModelsCb.ts`
  - defines weapon models/materials and file paths (`/models/equip/weapons/*.glb`)
  - `WeaponModelsCb.BOW` is modelId `500`
- `codebook/armorsModelsCb.ts`
  - defines armor models/materials (`/models/equip/armors/*.babylon`)
- `codebook/equipCbItem.ts`
  - shared shape: `id`, `model`, `pos`, `rot`, `scale`, `matCols`, `matRows`, `weaponTipPosition`
  - note: some entries can have `rot` missing/undefined (handle defensively)

## Atlas Material / UVC
- Implemented in `src/babylon/materials.ts` in `getPBRCustomMaterialFrom(...)`
- Custom attribute `uvc` is added in shader and shifts UV tile:
  - `mat.AddAttribute("uvc")`
  - vertex hook adds `uvc` to UVs
- Item material selection uses atlas index conversion (`materialId - 1` in character flow).

## Important Mapping Rules
- Item data (`src/data/items/item.ts`) has:
  - `modelId`
  - `materialId` (1-based)
- Character equip flow maps to atlas index with `materialId - 1`.

## Preview/GM Panel Practical Notes
- For preview panel we do **not** need instancing (single mesh is enough).
- To match in-game look:
  - load model from same path as codebook
  - apply same PBR custom material and texture atlas settings
  - apply same `uvc` offset logic
- When setting custom vertex data kind `uvc`, pass stride `2`:
  - `mesh.setVerticesData('uvc', data, true, 2)`

## Known Gotchas
- `copyFrom` on missing vectors crashes (`undefined._x`): use fallback `Vector3.Zero()`.
- `BOW` in codebook currently has no explicit `rot`, so preview code must handle null/undefined rotation.
- For weapons, texture `vScale` is inverted in existing codebook manager; keep same behavior in previews for consistency.
