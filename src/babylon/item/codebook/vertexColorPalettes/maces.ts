import { METAL_WEAPON_MATERIAL_NAMES, VertexColorWeaponPalette, WEAPON_METAL_COLOR_STEPS, WEAPON_STEEL_COLOR_STEPS } from './types'

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
            [WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.mid, WEAPON_METAL_COLOR_STEPS.pyroxide.light, [46, 17, 13], [98, 40, 27], [154, 72, 46]],
            [WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.mid, WEAPON_METAL_COLOR_STEPS.geonite.light, [39, 21, 13], [83, 49, 27], [133, 84, 46]],
            [WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.mid, WEAPON_METAL_COLOR_STEPS.mythril.light, [79, 49, 8], [175, 127, 24], [255, 221, 92]],
            [WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.mid, WEAPON_METAL_COLOR_STEPS.chaotite.light, [39, 5, 52], [100, 14, 109], [201, 36, 174]],
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
            [WEAPON_METAL_COLOR_STEPS.pyroxide.mid, WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.light, [46, 17, 13], [98, 40, 27]],
            [WEAPON_METAL_COLOR_STEPS.geonite.mid, WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.light, [39, 21, 13], [83, 49, 27]],
            [WEAPON_METAL_COLOR_STEPS.mythril.mid, WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.light, [79, 49, 8], [175, 127, 24]],
            [WEAPON_METAL_COLOR_STEPS.chaotite.mid, WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.light, [39, 5, 52], [100, 14, 109]],
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
            [WEAPON_METAL_COLOR_STEPS.pyroxide.mid, WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.light, [46, 17, 13], [98, 40, 27]],
            [WEAPON_METAL_COLOR_STEPS.geonite.mid, WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.light, [39, 21, 13], [83, 49, 27]],
            [WEAPON_METAL_COLOR_STEPS.mythril.mid, WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.light, [79, 49, 8], [175, 127, 24]],
            [WEAPON_METAL_COLOR_STEPS.chaotite.mid, WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.light, [39, 5, 52], [100, 14, 109]],
        ],
    },
}
