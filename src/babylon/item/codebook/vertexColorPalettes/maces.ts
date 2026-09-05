import { METAL_WEAPON_MATERIAL_NAMES, VertexColorWeaponPalette } from './types'

/** Local vertex-colour palettes for mace and hammer models. */
export const MaceVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    LIGHT_MACE: {
        materialNames: METAL_WEAPON_MATERIAL_NAMES,
        twoSided: true,
        slots: [
            {index: 0, source: [15, 15, 15], role: 'head dark'},
            {index: 1, source: [23, 23, 23], role: 'head mid'},
            {index: 2, source: [63, 63, 63], role: 'head highlight'},
            {index: 3, source: [34, 8, 0], role: 'shaft dark'},
            {index: 4, source: [81, 34, 0], role: 'shaft mid'},
            {index: 5, source: [81, 34, 8], role: 'shaft highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            [[54, 67, 82], [120, 144, 161], [194, 219, 232], [42, 18, 12], [91, 43, 25], [145, 76, 43]],
            [[76, 12, 17], [161, 37, 29], [255, 126, 58], [40, 12, 10], [88, 24, 16], [158, 53, 23]],
            [[13, 58, 45], [26, 132, 90], [101, 224, 158], [18, 38, 23], [41, 82, 43], [86, 142, 67]],
            [[6, 34, 105], [32, 126, 202], [111, 236, 255], [79, 49, 8], [175, 127, 24], [255, 221, 92]],
            [[61, 10, 84], [157, 30, 169], [255, 98, 218], [39, 5, 52], [100, 14, 109], [201, 36, 174]],
        ],
    },
}
