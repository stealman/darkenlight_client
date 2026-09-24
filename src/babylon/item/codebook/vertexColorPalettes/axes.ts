import { METAL_WEAPON_MATERIAL_NAMES, PICKAXE_MATERIAL_NAMES, VertexColorWeaponPalette, WEAPON_STEEL_COLOR_STEPS } from './types'

/** Local vertex-colour palettes for axe and pickaxe models. */
export const AxeVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    HANDAXE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        twoSided: true,
        slots: [
            {index: 0, source: [81, 34, 0], role: 'shaft mid'},
            {index: 1, source: [63, 63, 63], role: 'blade mid', isMetal: true},
            {index: 2, source: [34, 8, 0], role: 'shaft dark'},
            {index: 3, source: [23, 23, 23], role: 'blade highlight', isMetal: true},
            {index: 4, source: [15, 15, 15], role: 'blade dark', isMetal: true},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [[73, 42, 16], WEAPON_STEEL_COLOR_STEPS.mid, [126, 71, 30], WEAPON_STEEL_COLOR_STEPS.light, WEAPON_STEEL_COLOR_STEPS.dark],
            // pyroxide
            [[78, 39, 18], [132, 25, 20], [133, 67, 32], [255, 170, 72], [69, 12, 12]],
            // geonite
            [[68, 47, 19], [24, 101, 68], [119, 79, 33], [146, 241, 166], [10, 51, 39]],
            // mythril
            [[93, 57, 13], [26, 111, 183], [193, 138, 31], [177, 247, 255], [8, 44, 105]],
            // chaotite
            [[69, 17, 78], [126, 29, 142], [154, 42, 126], [255, 138, 237], [54, 7, 65]],
        ],
    },

    BATTLE_AXE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        twoSided: true,
        slots: [
            {index: 0, source: [63, 63, 63], role: 'blade highlight', isMetal: true},
            {index: 1, source: [15, 15, 15], role: 'head dark', isMetal: true},
            {index: 2, source: [47, 47, 47], role: 'head mid', isMetal: true},
            {index: 3, source: [81, 34, 0], role: 'shaft mid'},
            {index: 4, source: [34, 8, 0], role: 'shaft dark'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [WEAPON_STEEL_COLOR_STEPS.light, WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid, [73, 42, 16], [126, 71, 30]],
            // pyroxide
            [[255, 170, 72], [69, 12, 12], [132, 25, 20], [78, 39, 18], [133, 67, 32]],
            // geonite
            [[146, 241, 166], [10, 51, 39], [24, 101, 68], [68, 47, 19], [119, 79, 33]],
            // mythril
            [[177, 247, 255], [8, 44, 105], [26, 111, 183], [93, 57, 13], [193, 138, 31]],
            // chaotite
            [[255, 138, 237], [54, 7, 65], [126, 29, 142], [69, 17, 78], [154, 42, 126]],
        ],
    },

    LARGE_BATTLE_AXE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        twoSided: true,
        slots: [
            {index: 0, source: [34, 8, 0], role: 'shaft dark'},
            {index: 1, source: [15, 15, 15], role: 'head dark', isMetal: true},
            {index: 2, source: [63, 63, 63], role: 'blade highlight', isMetal: true},
            {index: 3, source: [81, 34, 0], role: 'shaft mid'},
            {index: 4, source: [47, 47, 47], role: 'head mid', isMetal: true},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [[126, 71, 30], WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.light, [73, 42, 16], WEAPON_STEEL_COLOR_STEPS.mid],
            // pyroxide
            [[133, 67, 32], [69, 12, 12], [255, 170, 72], [78, 39, 18], [132, 25, 20]],
            // geonite
            [[119, 79, 33], [10, 51, 39], [146, 241, 166], [68, 47, 19], [24, 101, 68]],
            // mythril
            [[193, 138, 31], [8, 44, 105], [177, 247, 255], [93, 57, 13], [26, 111, 183]],
            // chaotite
            [[154, 42, 126], [54, 7, 65], [255, 138, 237], [69, 17, 78], [126, 29, 142]],
        ],
    },

    PICKAXE: {
        materialNames: PICKAXE_MATERIAL_NAMES,
        metallicMaterialIndexes: [0, 1, 2, 3, 4],
        slots: [
            {index: 0, source: [40, 23, 7], role: 'shaft mid'},
            {index: 1, source: [72, 80, 88], role: 'head dark', isMetal: true},
            {index: 2, source: [60, 27, 8], role: 'shaft highlight'},
            {index: 3, source: [130, 134, 125], role: 'head highlight', isMetal: true},
        ],

        // This GLB has only dark and highlight metal slots; use the shared endpoints.
        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite, 6 diamond
        materialColors: [
            // steel
            [[73, 42, 16], WEAPON_STEEL_COLOR_STEPS.dark, [126, 71, 30], WEAPON_STEEL_COLOR_STEPS.light],
            // pyroxide
            [[78, 39, 18], [69, 12, 12], [133, 67, 32], [255, 170, 72]],
            // geonite
            [[68, 47, 19], [10, 51, 39], [119, 79, 33], [146, 241, 166]],
            // mythril
            [[93, 57, 13], [8, 44, 105], [193, 138, 31], [177, 247, 255]],
            // chaotite
            [[69, 17, 78], [54, 7, 65], [154, 42, 126], [255, 138, 237]],
            // diamond
            [[101, 60, 17], [45, 131, 232], [181, 113, 33], [176, 244, 255]],
        ],
    },

    GREATAXE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        slots: [
            {index: 0, source: [40, 23, 7], role: 'shaft mid'},
            {index: 1, source: [48, 52, 51], role: 'head mid', isMetal: true},
            {index: 2, source: [60, 27, 8], role: 'shaft highlight'},
            {index: 3, source: [127, 127, 127], role: 'blade mid', isMetal: true},
            {index: 4, source: [184, 184, 184], role: 'blade highlight', isMetal: true},
            {index: 5, source: [33, 35, 33], role: 'head dark', isMetal: true},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [[73, 42, 16], WEAPON_STEEL_COLOR_STEPS.mid, [126, 71, 30], WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.light, WEAPON_STEEL_COLOR_STEPS.dark],
            // pyroxide
            [[78, 39, 18], [132, 25, 20], [133, 67, 32], [132, 25, 20], [255, 170, 72], [69, 12, 12]],
            // geonite
            [[68, 47, 19], [24, 101, 68], [119, 79, 33], [24, 101, 68], [146, 241, 166], [10, 51, 39]],
            // mythril
            [[93, 57, 13], [26, 111, 183], [193, 138, 31], [26, 111, 183], [177, 247, 255], [8, 44, 105]],
            // chaotite
            [[69, 17, 78], [126, 29, 142], [154, 42, 126], [126, 29, 142], [255, 138, 237], [54, 7, 65]],
        ],
    },
}
