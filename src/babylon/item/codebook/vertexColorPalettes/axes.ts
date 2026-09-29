import { METAL_WEAPON_MATERIAL_NAMES, PICKAXE_MATERIAL_NAMES, VertexColorWeaponPalette, WEAPON_METAL_COLOR_STEPS, WEAPON_STEEL_COLOR_STEPS } from './types'

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
            [[78, 39, 18], WEAPON_METAL_COLOR_STEPS.pyroxide.mid, [133, 67, 32], WEAPON_METAL_COLOR_STEPS.pyroxide.light, WEAPON_METAL_COLOR_STEPS.pyroxide.dark],
            // geonite
            [[68, 47, 19], WEAPON_METAL_COLOR_STEPS.geonite.mid, [119, 79, 33], WEAPON_METAL_COLOR_STEPS.geonite.light, WEAPON_METAL_COLOR_STEPS.geonite.dark],
            // mythril
            [[93, 57, 13], WEAPON_METAL_COLOR_STEPS.mythril.mid, [193, 138, 31], WEAPON_METAL_COLOR_STEPS.mythril.light, WEAPON_METAL_COLOR_STEPS.mythril.dark],
            // chaotite
            [[69, 17, 78], WEAPON_METAL_COLOR_STEPS.chaotite.mid, [154, 42, 126], WEAPON_METAL_COLOR_STEPS.chaotite.light, WEAPON_METAL_COLOR_STEPS.chaotite.dark],
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
            [WEAPON_METAL_COLOR_STEPS.pyroxide.light, WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.mid, [78, 39, 18], [133, 67, 32]],
            // geonite
            [WEAPON_METAL_COLOR_STEPS.geonite.light, WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.mid, [68, 47, 19], [119, 79, 33]],
            // mythril
            [WEAPON_METAL_COLOR_STEPS.mythril.light, WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.mid, [93, 57, 13], [193, 138, 31]],
            // chaotite
            [WEAPON_METAL_COLOR_STEPS.chaotite.light, WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.mid, [69, 17, 78], [154, 42, 126]],
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
            [[133, 67, 32], WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.light, [78, 39, 18], WEAPON_METAL_COLOR_STEPS.pyroxide.mid],
            // geonite
            [[119, 79, 33], WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.light, [68, 47, 19], WEAPON_METAL_COLOR_STEPS.geonite.mid],
            // mythril
            [[193, 138, 31], WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.light, [93, 57, 13], WEAPON_METAL_COLOR_STEPS.mythril.mid],
            // chaotite
            [[154, 42, 126], WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.light, [69, 17, 78], WEAPON_METAL_COLOR_STEPS.chaotite.mid],
        ],
    },

    PICKAXE: {
        materialNames: PICKAXE_MATERIAL_NAMES,
        metallicMaterialIndexes: [0, 1, 2, 3, 4],
        twoSided: true,
        slots: [
            {index: 0, source: [15, 15, 15], role: 'head dark', isMetal: true},
            {index: 1, source: [47, 47, 47], role: 'head mid', isMetal: true},
            {index: 2, source: [63, 63, 63], role: 'head highlight', isMetal: true},
            {index: 3, source: [40, 23, 7], role: 'shaft mid'},
            {index: 4, source: [60, 27, 8], role: 'shaft highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite, 6 diamond
        materialColors: [
            // steel
            [WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.light, [73, 42, 16], [126, 71, 30]],
            // pyroxide
            [WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.mid, WEAPON_METAL_COLOR_STEPS.pyroxide.light, [78, 39, 18], [133, 67, 32]],
            // geonite
            [WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.mid, WEAPON_METAL_COLOR_STEPS.geonite.light, [68, 47, 19], [119, 79, 33]],
            // mythril
            [WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.mid, WEAPON_METAL_COLOR_STEPS.mythril.light, [93, 57, 13], [193, 138, 31]],
            // chaotite
            [WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.mid, WEAPON_METAL_COLOR_STEPS.chaotite.light, [69, 17, 78], [154, 42, 126]],
            // diamond
            [[45, 131, 232], [111, 188, 244], [176, 244, 255], [101, 60, 17], [181, 113, 33]],
        ],
    },

    GREATAXE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        twoSided: true,
        slots: [
            {index: 0, source: [15, 15, 15], role: 'head dark', isMetal: true},
            {index: 1, source: [47, 47, 47], role: 'head mid', isMetal: true},
            {index: 2, source: [63, 63, 63], role: 'blade highlight', isMetal: true},
            {index: 3, source: [40, 23, 7], role: 'shaft mid'},
            {index: 4, source: [60, 27, 8], role: 'shaft highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid, WEAPON_STEEL_COLOR_STEPS.light, [73, 42, 16], [126, 71, 30]],
            // pyroxide
            [WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.mid, WEAPON_METAL_COLOR_STEPS.pyroxide.light, [78, 39, 18], [133, 67, 32]],
            // geonite
            [WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.mid, WEAPON_METAL_COLOR_STEPS.geonite.light, [68, 47, 19], [119, 79, 33]],
            // mythril
            [WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.mid, WEAPON_METAL_COLOR_STEPS.mythril.light, [93, 57, 13], [193, 138, 31]],
            // chaotite
            [WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.mid, WEAPON_METAL_COLOR_STEPS.chaotite.light, [69, 17, 78], [154, 42, 126]],
        ],
    },
}
