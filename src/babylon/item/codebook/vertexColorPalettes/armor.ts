import { VertexColorWeaponPalette } from './types'

/**
 * Source colours used in shield.glb. They label metal depth from shadow to
 * highlight; the shader maps them to the equipped shield material.
 */
export const ShieldVertexColorPalette: VertexColorWeaponPalette = {
    // The voxel GLB has visible faces with reversed normals. Render both sides
    // just as we do for the affected weapon models.
    twoSided: true,
    // These values were sampled from the sRGB armor atlas, unlike the
    // already-tuned weapon palettes.
    materialColorSpace: 'srgb',
    // Armour has no self-illumination: its brightness must follow the scene.
    baseEmissiveStrength: 0,
    // materialId maps directly to row index: Steel 1, Astracyte 2, Agapyte 3,
    // Gold 4, Blood Stone 5, Dark Stone 6, reserved 7, Mythril 8.
    materialNames: ['Steel', 'Astracyte', 'Agapyte', 'Gold', 'Blood Stone', 'Dark Stone', 'Reserved', 'Mythril'],
    slots: [
        {index: 0, source: [23, 23, 23], role: 'metal deep shadow', isMetal: true},
        {index: 1, source: [47, 47, 47], role: 'metal shadow', isMetal: true},
        {index: 2, source: [63, 63, 63], role: 'metal dark', isMetal: true},
        {index: 3, source: [103, 103, 103], role: 'metal mid', isMetal: true},
        {index: 4, source: [127, 127, 127], role: 'metal light', isMetal: true},
        {index: 5, source: [184, 184, 184], role: 'metal highlight', isMetal: true},
    ],
    materialColors: [
        // Each ramp stays close to the matching metal's atlas colour. The
        // vertex shades describe form, not dramatically different materials.
        [[155, 155, 155], [168, 168, 168], [180, 180, 180], [190, 190, 190], [201, 201, 201], [208, 208, 208]], // Steel
        [[76, 112, 135], [89, 129, 155], [98, 143, 172], [104, 151, 181], [120, 171, 204], [128, 178, 214]], // Astracyte
        [[61, 130, 61], [72, 151, 72], [81, 170, 81], [86, 182, 86], [106, 204, 106], [116, 215, 116]], // Agapyte
        [[246, 178, 10], [251, 188, 14], [255, 198, 18], [255, 208, 25], [255, 224, 48], [255, 228, 54]], // Gold
        [[120, 63, 59], [140, 73, 68], [157, 82, 76], [167, 87, 81], [187, 106, 98], [196, 114, 106]], // Blood Stone
        [[40, 40, 40], [47, 47, 47], [52, 52, 52], [55, 55, 55], [63, 63, 63], [68, 68, 68]], // Dark Stone
        [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], // Reserved materialId 7
        [[22, 79, 183], [26, 92, 212], [29, 104, 239], [31, 110, 254], [57, 132, 255], [72, 144, 255]], // Mythril
    ],
}
