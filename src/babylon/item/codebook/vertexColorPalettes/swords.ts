import { METAL_WEAPON_MATERIAL_NAMES, VertexColorWeaponPalette, WEAPON_STEEL_COLOR_STEPS } from './types'

/**
 * Local vertex-colour palettes for every sword model.
 *
 * Source RGB values belong only to their own GLB.  They do not need to match
 * MagicaVoxel colours used by any other weapon.
 */
export const SwordVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    LONGSWORD: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        slots: [
            {index: 0, source: [127, 127, 127], role: 'blade dark', isMetal: true},
            {index: 1, source: [184, 184, 184], role: 'blade mid', isMetal: true},
            {index: 2, source: [218, 218, 218], role: 'blade highlight', isMetal: true},
            {index: 3, source: [34, 0, 0], role: 'grip dark'},
            {index: 4, source: [63, 0, 0], role: 'grip mid'},
            {index: 5, source: [103, 0, 0], role: 'grip highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.light, [42, 18, 12], [91, 43, 25], [145, 76, 43]],
            // pyroxide
            [[69, 12, 12], [132, 25, 20], [255, 170, 72], [46, 17, 13], [98, 40, 27], [154, 72, 46]],
            // geonite
            [[10, 51, 39], [24, 101, 68], [146, 241, 166], [39, 21, 13], [83, 49, 27], [133, 84, 46]],
            // mythril
            [[8, 44, 105], [26, 111, 183], [177, 247, 255], [79, 49, 8], [175, 127, 24], [255, 221, 92]],
            // chaotite
            [[54, 7, 65], [126, 29, 142], [255, 138, 237], [39, 5, 52], [100, 14, 109], [201, 36, 174]],
        ],
    },

    BROADSWORD: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        slots: [
            {index: 0, source: [127, 127, 127], role: 'blade dark', isMetal: true},
            {index: 1, source: [184, 184, 184], role: 'blade mid', isMetal: true},
            {index: 2, source: [218, 218, 218], role: 'blade highlight', isMetal: true},
            {index: 3, source: [34, 0, 0], role: 'grip dark'},
            {index: 4, source: [63, 0, 0], role: 'grip mid'},
            {index: 5, source: [103, 0, 0], role: 'grip highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.light, [42, 18, 12], [91, 43, 25], [145, 76, 43]],
            // pyroxide
            [[69, 12, 12], [132, 25, 20], [255, 170, 72], [46, 17, 13], [98, 40, 27], [154, 72, 46]],
            // geonite
            [[10, 51, 39], [24, 101, 68], [146, 241, 166], [39, 21, 13], [83, 49, 27], [133, 84, 46]],
            // mythril
            [[8, 44, 105], [26, 111, 183], [177, 247, 255], [79, 49, 8], [175, 127, 24], [255, 221, 92]],
            // chaotite
            [[54, 7, 65], [126, 29, 142], [255, 138, 237], [39, 5, 52], [100, 14, 109], [201, 36, 174]],
        ],
    },

    GREATSWORD: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        twoSided: true,
        slots: [
            {index: 0, source: [127, 127, 127], role: 'blade dark', isMetal: true},
            {index: 1, source: [184, 184, 184], role: 'blade mid', isMetal: true},
            {index: 2, source: [218, 218, 218], role: 'blade highlight', isMetal: true},
            {index: 3, source: [34, 0, 0], role: 'grip dark'},
            {index: 4, source: [63, 0, 0], role: 'grip mid'},
            {index: 5, source: [103, 0, 0], role: 'grip highlight'},
        ],

        // The Greatsword GLB uses the same source slots as Longsword, but its
        // material remains independent so later art changes stay local.
        materialColors: [
            // steel
            [WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.light, [42, 18, 12], [91, 43, 25], [145, 76, 43]],
            // pyroxide
            [[69, 12, 12], [132, 25, 20], [255, 170, 72], [46, 17, 13], [98, 40, 27], [154, 72, 46]],
            // geonite
            [[10, 51, 39], [24, 101, 68], [146, 241, 166], [39, 21, 13], [83, 49, 27], [133, 84, 46]],
            // mythril
            [[8, 44, 105], [26, 111, 183], [177, 247, 255], [79, 49, 8], [175, 127, 24], [255, 221, 92]],
            // chaotite
            [[54, 7, 65], [126, 29, 142], [255, 138, 237], [39, 5, 52], [100, 14, 109], [201, 36, 174]],
        ],
    },
}
