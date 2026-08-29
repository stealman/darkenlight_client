export type VertexRgb = readonly [number, number, number]

export interface VertexColorSlot {
    /** Local palette index used by the model's material colour tables. */
    index: number
    /** Exact RGB exported with this model's vertices, in the 0–255 range. */
    source: VertexRgb
    /** Human-readable only; it is not used by the shader. */
    role: string
}

export interface VertexColorWeaponPalette {
    /** Ordered material rows: materialId 1–5 maps to array index 0–4. */
    materialColors: readonly (readonly VertexRgb[])[]
    slots: readonly VertexColorSlot[]
}

export const WEAPON_MATERIAL_VARIANT_COUNT = 5
