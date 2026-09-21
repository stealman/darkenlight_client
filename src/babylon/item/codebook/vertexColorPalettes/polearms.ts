import { METAL_WEAPON_MATERIAL_NAMES, VertexColorWeaponPalette } from './types'

/** Local vertex-colour palettes for spear and halberd models. */
const SPEAR_VERTEX_COLOR_PALETTE: VertexColorWeaponPalette = {
    materialNames: METAL_WEAPON_MATERIAL_NAMES,
    slots: [
        {index: 0, source: [81, 34, 0], role: 'shaft mid'},
        {index: 1, source: [34, 8, 0], role: 'shaft dark'},
        {index: 2, source: [63, 63, 63], role: 'spearhead highlight', isMetal: true},
        {index: 3, source: [15, 15, 15], role: 'spearhead dark', isMetal: true},
        {index: 4, source: [47, 47, 47], role: 'spearhead mid', isMetal: true},
    ],

    // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
    materialColors: [
        [[73, 42, 16], [126, 71, 30], [219, 237, 242], [52, 62, 64], [93, 110, 116]],
        [[78, 39, 18], [133, 67, 32], [255, 170, 72], [69, 12, 12], [132, 25, 20]],
        [[68, 47, 19], [119, 79, 33], [146, 241, 166], [10, 51, 39], [24, 101, 68]],
        [[93, 57, 13], [193, 138, 31], [177, 247, 255], [8, 44, 105], [26, 111, 183]],
        [[69, 17, 78], [154, 42, 126], [255, 138, 237], [54, 7, 65], [126, 29, 142]],
    ],
    twoSided: true,
}

export const PolearmVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    HUNTING_SPEAR: SPEAR_VERTEX_COLOR_PALETTE,

    WAR_SPEAR: SPEAR_VERTEX_COLOR_PALETTE,

    HALBERD: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        slots: [
            {index: 0, source: [81, 34, 0], role: 'shaft mid'},
            {index: 1, source: [34, 8, 0], role: 'shaft dark'},
            {index: 2, source: [127, 127, 127], role: 'blade highlight', isMetal: true},
            {index: 3, source: [15, 15, 15], role: 'blade dark', isMetal: true},
            {index: 4, source: [63, 63, 63], role: 'blade mid', isMetal: true},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            [[73, 42, 16], [126, 71, 30], [219, 237, 242], [52, 62, 64], [93, 110, 116]],
            [[78, 39, 18], [133, 67, 32], [255, 170, 72], [69, 12, 12], [132, 25, 20]],
            [[68, 47, 19], [119, 79, 33], [146, 241, 166], [10, 51, 39], [24, 101, 68]],
            [[93, 57, 13], [193, 138, 31], [177, 247, 255], [8, 44, 105], [26, 111, 183]],
            [[69, 17, 78], [154, 42, 126], [255, 138, 237], [54, 7, 65], [126, 29, 142]],
        ],
        twoSided: true,
    },
}
