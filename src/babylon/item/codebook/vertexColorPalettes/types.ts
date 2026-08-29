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
    /** Ordered material rows: materialId N maps to array index N - 1. */
    materialColors: readonly (readonly VertexRgb[])[]
    materialNames: readonly string[]
    slots: readonly VertexColorSlot[]
}

export const METAL_WEAPON_MATERIAL_NAMES = ['Steel', 'Pyroxide', 'Geonite', 'Mythril', 'Chaotite']
export const BOW_WEAPON_MATERIAL_NAMES = ['Wooden', 'Cherrywood', 'Mahogany', 'Elven', 'Ethereal']
export const PICKAXE_MATERIAL_NAMES = [...METAL_WEAPON_MATERIAL_NAMES, 'Diamond']
