import { STEEL_ARMOR_RAMP_SRGB, VertexColorWeaponPalette, VertexRgb } from './types'

/**
 * Source colours used in the vertex-colour shield and helmet GLBs. They label
 * metal depth from shadow to highlight; the shader maps them to armour metal.
 */
export const MetalArmorVertexColorPalette: VertexColorWeaponPalette = {
    // The voxel GLB has visible faces with reversed normals. Render both sides
    // just as we do for the affected weapon models.
    twoSided: true,
    // These values were sampled from the sRGB armor atlas, unlike the
    // already-tuned weapon palettes.
    materialColorSpace: 'srgb',
    // Armour has no self-illumination: its brightness must follow the scene.
    baseEmissiveStrength: 0,
    // Palette indexes are materialId - 1. Keep the existing Mythril row at
    // index 7 (materialId 8); Adamantium, a new reserved row and Rust follow it.
    materialNames: ['Steel', 'Astracyte', 'Agapyte', 'Gold', 'Blood Stone', 'Dark Stone', 'Reserved', 'Mythril', 'Adamantium', 'Reserved', 'Rust'],
    slots: [
        {index: 0, source: [23, 23, 23], role: 'metal deep shadow', isMetal: true},
        {index: 1, source: [47, 47, 47], role: 'metal shadow', isMetal: true},
        {index: 2, source: [63, 63, 63], role: 'metal dark', isMetal: true},
        // The helmet uses this one cool-grey voxel between its dark and mid shades.
        {index: 3, source: [72, 80, 88], role: 'metal dark-mid', isMetal: true},
        {index: 4, source: [103, 103, 103], role: 'metal mid', isMetal: true},
        {index: 5, source: [127, 127, 127], role: 'metal light', isMetal: true},
        {index: 6, source: [184, 184, 184], role: 'metal highlight', isMetal: true},
    ],
    materialColors: [
        // Each ramp stays close to the matching metal's atlas colour. The
        // vertex shades describe form, not dramatically different materials.
        [STEEL_ARMOR_RAMP_SRGB[0], STEEL_ARMOR_RAMP_SRGB[1], STEEL_ARMOR_RAMP_SRGB[2], [185, 185, 185], STEEL_ARMOR_RAMP_SRGB[3], STEEL_ARMOR_RAMP_SRGB[4], STEEL_ARMOR_RAMP_SRGB[5]], // Steel
        [[76, 112, 135], [89, 129, 155], [98, 143, 172], [101, 147, 177], [104, 151, 181], [120, 171, 204], [125, 179, 214]], // Astracyte
        [[61, 130, 61], [72, 151, 72], [81, 170, 81], [84, 176, 84], [86, 182, 86], [106, 204, 106], [112, 211, 112]], // Agapyte
        [[241, 178, 10], [246, 188, 14], [255, 198, 18], [255, 203, 22], [255, 208, 25], [255, 224, 48], [255, 227, 52]], // Gold
        [[120, 63, 59], [140, 73, 68], [157, 82, 76], [162, 85, 79], [167, 87, 81], [187, 106, 98], [193, 111, 103]], // Blood Stone
        [[40, 40, 40], [47, 47, 47], [52, 52, 52], [54, 54, 54], [55, 55, 55], [63, 63, 63], [66, 66, 66]], // Dark Stone
        [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], // Reserved materialId 7
        [[22, 79, 183], [26, 92, 212], [29, 104, 239], [30, 107, 247], [31, 110, 254], [57, 132, 255], [67, 140, 255]], // Mythril materialId 8
        [[120, 10, 10], [155, 16, 15], [195, 22, 20], [210, 26, 24], [225, 30, 27], [240, 45, 38], [250, 62, 49]], // Adamantium materialId 9
        [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], // Reserved materialId 10
        [[70, 50, 25], [90, 61, 29], [112, 74, 34], [130, 86, 38], [148, 100, 44], [168, 118, 52], [182, 132, 60]], // Rust materialId 11
    ],
}

/**
 * The detailed shield uses the normal grey metal ramp plus a red vertex-colour
 * marker for its secondary material. The marker does not describe a final
 * colour; it is replaced per armour material so one shield mesh works for all
 * metal variants.
 */
const SHIELD_DETAIL_SECONDARY_COLORS: readonly VertexRgb[] = [
    [100, 100, 100], // Steel: dark steel
    [225, 139, 35], // Astracyte: amber
    [145, 63, 181], // Agapyte: purple
    [143, 42, 54], // Gold: crimson
    [50, 121, 157], // Blood Stone: blue
    [205, 122, 35], // Dark Stone: ochre
    [0, 0, 0], // Reserved materialId 7
    [210, 154, 40], // Mythril: gold
    [37, 139, 139], // Adamantium: teal
    [0, 0, 0], // Reserved materialId 10
    [47, 125, 151], // Rust: blue
]

export const ShieldDetailVertexColorPalette: VertexColorWeaponPalette = {
    ...MetalArmorVertexColorPalette,
    slots: [
        ...MetalArmorVertexColorPalette.slots,
        // The red swatch exported by Blender is stored in the linear glTF
        // colour attribute. It deliberately stays non-metallic so it reads as
        // a separate material (leather, enamel, cloth, and so on).
        {index: 7, source: [161, 1, 18], role: 'secondary material marker'},
    ],
    materialColors: MetalArmorVertexColorPalette.materialColors.map((colors, materialIndex) => [
        ...colors,
        SHIELD_DETAIL_SECONDARY_COLORS[materialIndex],
    ]),
}
