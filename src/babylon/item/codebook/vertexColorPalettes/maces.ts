import { METAL_WEAPON_MATERIAL_NAMES, VertexColorWeaponPalette, WEAPON_STEEL_COLOR_STEPS } from './types'

/** Local vertex-colour palettes for mace and hammer models. */
export const MaceVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    LIGHT_MACE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        twoSided: true,
        slots: [
            {index: 0, source: [15, 15, 15], role: 'head dark', isMetal: true},
            {index: 1, source: [23, 23, 23], role: 'head mid', isMetal: true},
            {index: 2, source: [63, 63, 63], role: 'head highlight', isMetal: true},
            {index: 3, source: [34, 8, 0], role: 'shaft dark'},
            {index: 4, source: [81, 34, 0], role: 'shaft mid'},
            {index: 5, source: [81, 34, 8], role: 'shaft highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            [WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.light, [42, 18, 12], [91, 43, 25], [145, 76, 43]],
            [[69, 12, 12], [132, 25, 20], [255, 170, 72], [46, 17, 13], [98, 40, 27], [154, 72, 46]],
            [[10, 51, 39], [24, 101, 68], [146, 241, 166], [39, 21, 13], [83, 49, 27], [133, 84, 46]],
            [[8, 44, 105], [26, 111, 183], [177, 247, 255], [79, 49, 8], [175, 127, 24], [255, 221, 92]],
            [[54, 7, 65], [126, 29, 142], [255, 138, 237], [39, 5, 52], [100, 14, 109], [201, 36, 174]],
        ],
    },

    WARMACE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        slots: [
            {index: 0, source: [23, 23, 23], role: 'head mid', isMetal: true},
            {index: 1, source: [15, 15, 15], role: 'head dark', isMetal: true},
            {index: 2, source: [63, 63, 63], role: 'head highlight', isMetal: true},
            {index: 3, source: [34, 8, 0], role: 'shaft dark'},
            {index: 4, source: [81, 34, 0], role: 'shaft mid'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            [WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.light, [42, 18, 12], [91, 43, 25]],
            [[132, 25, 20], [69, 12, 12], [255, 170, 72], [46, 17, 13], [98, 40, 27]],
            [[24, 101, 68], [10, 51, 39], [146, 241, 166], [39, 21, 13], [83, 49, 27]],
            [[26, 111, 183], [8, 44, 105], [177, 247, 255], [79, 49, 8], [175, 127, 24]],
            [[126, 29, 142], [54, 7, 65], [255, 138, 237], [39, 5, 52], [100, 14, 109]],
        ],
        twoSided: true,
    },

    WARHAMMER: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        twoSided: true,
        slots: [
            {index: 0, source: [23, 23, 23], role: 'head mid', isMetal: true},
            {index: 1, source: [15, 15, 15], role: 'head dark', isMetal: true},
            {index: 2, source: [63, 63, 63], role: 'head highlight', isMetal: true},
            {index: 3, source: [34, 8, 0], role: 'shaft dark'},
            {index: 4, source: [81, 34, 0], role: 'shaft mid'},
        ],

        // The source slots match Warmace, but the palette stays local so the
        // Warhammer model can evolve independently.
        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            [WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.light, [42, 18, 12], [91, 43, 25]],
            [[132, 25, 20], [69, 12, 12], [255, 170, 72], [46, 17, 13], [98, 40, 27]],
            [[24, 101, 68], [10, 51, 39], [146, 241, 166], [39, 21, 13], [83, 49, 27]],
            [[26, 111, 183], [8, 44, 105], [177, 247, 255], [79, 49, 8], [175, 127, 24]],
            [[126, 29, 142], [54, 7, 65], [255, 138, 237], [39, 5, 52], [100, 14, 109]],
        ],
    },
}
