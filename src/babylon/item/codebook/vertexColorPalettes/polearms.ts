import { METAL_WEAPON_MATERIAL_NAMES, VertexColorWeaponPalette, WEAPON_METAL_COLOR_STEPS, WEAPON_STEEL_COLOR_STEPS } from './types'

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
        [[73, 42, 16], [126, 71, 30], WEAPON_STEEL_COLOR_STEPS.light, WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid],
        [[78, 39, 18], [133, 67, 32], WEAPON_METAL_COLOR_STEPS.pyroxide.light, WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.mid],
        [[68, 47, 19], [119, 79, 33], WEAPON_METAL_COLOR_STEPS.geonite.light, WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.mid],
        [[93, 57, 13], [193, 138, 31], WEAPON_METAL_COLOR_STEPS.mythril.light, WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.mid],
        [[69, 17, 78], [154, 42, 126], WEAPON_METAL_COLOR_STEPS.chaotite.light, WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.mid],
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
            [[73, 42, 16], [126, 71, 30], WEAPON_STEEL_COLOR_STEPS.light, WEAPON_STEEL_COLOR_STEPS.dark, WEAPON_STEEL_COLOR_STEPS.mid],
            [[78, 39, 18], [133, 67, 32], WEAPON_METAL_COLOR_STEPS.pyroxide.light, WEAPON_METAL_COLOR_STEPS.pyroxide.dark, WEAPON_METAL_COLOR_STEPS.pyroxide.mid],
            [[68, 47, 19], [119, 79, 33], WEAPON_METAL_COLOR_STEPS.geonite.light, WEAPON_METAL_COLOR_STEPS.geonite.dark, WEAPON_METAL_COLOR_STEPS.geonite.mid],
            [[93, 57, 13], [193, 138, 31], WEAPON_METAL_COLOR_STEPS.mythril.light, WEAPON_METAL_COLOR_STEPS.mythril.dark, WEAPON_METAL_COLOR_STEPS.mythril.mid],
            [[69, 17, 78], [154, 42, 126], WEAPON_METAL_COLOR_STEPS.chaotite.light, WEAPON_METAL_COLOR_STEPS.chaotite.dark, WEAPON_METAL_COLOR_STEPS.chaotite.mid],
        ],
        twoSided: true,
    },
}
