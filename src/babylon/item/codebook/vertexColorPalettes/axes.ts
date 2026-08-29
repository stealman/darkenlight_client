import { METAL_WEAPON_MATERIAL_NAMES, PICKAXE_MATERIAL_NAMES, VertexColorWeaponPalette } from './types'

/** Local vertex-colour palettes for axe and pickaxe models. */
export const AxeVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    PICKAXE: {
        materialNames: PICKAXE_MATERIAL_NAMES,
        slots: [
            {index: 0, source: [40, 23, 7], role: 'shaft mid'},
            {index: 1, source: [72, 80, 88], role: 'head dark'},
            {index: 2, source: [60, 27, 8], role: 'shaft highlight'},
            {index: 3, source: [130, 134, 125], role: 'head highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite, 6 diamond
        materialColors: [
            // steel
            [[73, 42, 16], [70, 87, 96], [126, 71, 30], [179, 197, 204]],
            // pyroxide
            [[63, 25, 10], [120, 22, 18], [116, 53, 20], [242, 108, 49]],
            // geonite
            [[44, 59, 20], [17, 83, 56], [87, 113, 36], [106, 215, 140]],
            // mythril
            [[93, 57, 13], [18, 92, 171], [193, 138, 31], [128, 235, 255]],
            // chaotite
            [[69, 17, 78], [111, 22, 132], [154, 42, 126], [239, 89, 224]],
            // diamond
            [[101, 60, 17], [45, 131, 232], [181, 113, 33], [176, 244, 255]],
        ],
    },

    GREATAXE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        slots: [
            {index: 0, source: [40, 23, 7], role: 'shaft mid'},
            {index: 1, source: [48, 52, 51], role: 'head mid'},
            {index: 2, source: [60, 27, 8], role: 'shaft highlight'},
            {index: 3, source: [127, 127, 127], role: 'blade mid'},
            {index: 4, source: [184, 184, 184], role: 'blade highlight'},
            {index: 5, source: [33, 35, 33], role: 'head dark'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [[73, 42, 16], [93, 110, 116], [126, 71, 30], [162, 184, 192], [219, 237, 242], [52, 62, 64]],
            // pyroxide
            [[63, 25, 10], [132, 25, 20], [116, 53, 20], [226, 70, 35], [255, 170, 72], [69, 12, 12]],
            // geonite
            [[44, 59, 20], [24, 101, 68], [87, 113, 36], [63, 183, 120], [146, 241, 166], [10, 51, 39]],
            // mythril
            [[93, 57, 13], [26, 111, 183], [193, 138, 31], [77, 207, 242], [177, 247, 255], [8, 44, 105]],
            // chaotite
            [[69, 17, 78], [126, 29, 142], [154, 42, 126], [218, 51, 201], [255, 138, 237], [54, 7, 65]],
        ],
    },
}
