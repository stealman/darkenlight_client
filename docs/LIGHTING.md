# Lighting constraints

Source: `src/babylon/scene/lights.ts`, `scene/lighting` and
`world/foggyAreaManager.ts`.

- Lighting is presentation; it does not determine server visibility or combat LOS.
- Keep fixed light-slot lists and shader topology while moving. Reassign sources
  and update uniforms rather than repeatedly changing material light counts.
- Shared thin-instance meshes need the full selected light budget; a body's
  nearest-light list cannot serve every instance in one shared mesh.
- Avoid broad per-material precompilation: it previously caused mobile startup
  and runtime stalls. Preserve the existing asynchronous monster warm-up path.
- World transitions must clean old lights/shadow references and apply the new
  environment.
- If profiling requires more local lights, spatial terrain chunks are the proposed
  next step; additional lights are not free merely because range hides them.
- All actual colours, quality budgets, shadows and day/night rules live in code.
