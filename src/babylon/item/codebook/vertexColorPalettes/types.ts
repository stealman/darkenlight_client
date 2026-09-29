export type VertexRgb = readonly [number, number, number]

/**
 * Shared steel ramp sampled for armour in sRGB. Weapon palettes store linear
 * shader values, so their three metal steps are derived from this ramp below.
 */
export const STEEL_ARMOR_RAMP_SRGB: readonly VertexRgb[] = [
    [147, 147, 147],
    [160, 160, 160],
    [172, 172, 172],
    [182, 182, 182],
    [193, 193, 193],
    [197, 197, 197],
]

/** Shared Mythril source ramp used by armour and converted for weapon shaders. */
export const MYTHRIL_ARMOR_RAMP_SRGB: readonly VertexRgb[] = [
    [29, 82, 181],
    [34, 96, 209],
    [38, 109, 236],
    [39, 112, 244],
    [42, 125, 255],
    [67, 138, 254],
    [83, 157, 255],
]

function srgbToLinearByte(value: number): number {
    const normalized = value / 255
    const linear = normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4)
    return Math.round(linear * 255)
}

function srgbToLinearRgb(color: VertexRgb): VertexRgb {
    return [
        srgbToLinearByte(color[0]),
        srgbToLinearByte(color[1]),
        srgbToLinearByte(color[2]),
    ]
}

/** Steel weapon metal slots: darkest shield shade, shield mid, shield highlight. */
export const WEAPON_STEEL_COLOR_STEPS = {
    dark: srgbToLinearRgb(STEEL_ARMOR_RAMP_SRGB[0]),
    mid: srgbToLinearRgb(STEEL_ARMOR_RAMP_SRGB[3]),
    light: srgbToLinearRgb(STEEL_ARMOR_RAMP_SRGB[5]),
} as const

/** Shared non-steel weapon metal ramps in linear shader colour space. */
export const WEAPON_METAL_COLOR_STEPS = {
    pyroxide: {dark: [69, 12, 12], mid: [112, 21, 17], light: [217, 145, 61]},
    geonite: {dark: [10, 51, 39], mid: [20, 86, 58], light: [124, 205, 141]},
    mythril: {
        dark: srgbToLinearRgb(MYTHRIL_ARMOR_RAMP_SRGB[0]),
        mid: srgbToLinearRgb(MYTHRIL_ARMOR_RAMP_SRGB[4]),
        light: srgbToLinearRgb(MYTHRIL_ARMOR_RAMP_SRGB[6]),
    },
    chaotite: {dark: [54, 7, 65], mid: [107, 25, 121], light: [217, 117, 201]},
} as const

export interface VertexColorSlot {
    /** Local palette index used by the model's material colour tables. */
    index: number
    /** Exact RGB exported with this model's vertices, in the 0–255 range. */
    source: VertexRgb
    /** Human-readable only; it is not used by the shader. */
    role: string
    /** Apply the shared PBR metal treatment to this part of the model. */
    isMetal?: boolean
}

export interface VertexColorWeaponPalette {
    /** Ordered material rows: materialId N maps to array index N - 1. */
    materialColors: readonly (readonly VertexRgb[])[]
    materialNames: readonly string[]
    slots: readonly VertexColorSlot[]
    /**
     * Colour space of materialColors. Existing weapon palettes are authored as
     * linear shader values; armour palettes sampled from a gamma-space texture
     * use sRGB and are converted before PBR lighting.
     */
    materialColorSpace?: 'linear' | 'srgb'
    /** Constant self-illumination. Weapon palettes use the shared subtle glow; armour normally uses none. */
    baseEmissiveStrength?: number
    /**
     * Zero-based material rows whose marked slots are metal. By default every
     * row uses the metal treatment; Pickaxe excludes its diamond row.
     */
    metallicMaterialIndexes?: readonly number[]
    /**
     * Material rows whose metal slots receive additional emissive light.
     * Omit to use the shared Pyroxide row, or pass an empty array to opt out.
     */
    emissiveMetalMaterialIndexes?: readonly number[]
    /** Additional emissive light strength for the marked metal material rows. */
    emissiveMetalStrength?: number
    /** Render both sides for models whose GLB contains visible reversed faces. */
    twoSided?: boolean
}

export const METAL_WEAPON_MATERIAL_NAMES = ['Steel', 'Pyroxide', 'Geonite', 'Mythril', 'Chaotite']
export const BOW_WEAPON_MATERIAL_NAMES = ['Wooden', 'Cherrywood', 'Mahogany', 'Elven', 'Ethereal']
export const PICKAXE_MATERIAL_NAMES = [...METAL_WEAPON_MATERIAL_NAMES, 'Diamond']
