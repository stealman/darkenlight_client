# Item rendering

- Reuse `equipManager.ts` and shared thin instances: `matrix` (16 floats),
  `uvc` (2 floats). Avoid one mesh per equipped item.
- Model/material definitions live in `codebook`. Item `materialId` is 1-based;
  the render palette/atlas index is `materialId - 1`.
- Follow the existing vertex-colour palette or atlas path for that model;
  see [asset workflow](../../../../docs/EQUIPMENT_ASSET_WORKFLOW.md).
- Previews must reuse the runtime model, material, UV/palette mapping and texture
  orientation. For vertex data use `setVerticesData('uvc', data, true, 2)`.
- Optional model rotations may be absent; do not `copyFrom` undefined vectors.
