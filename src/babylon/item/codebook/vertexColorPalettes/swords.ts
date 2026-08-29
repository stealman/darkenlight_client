import { VertexColorWeaponPalette } from './types'

/**
 * Local vertex-colour palettes for every sword model.
 *
 * Source RGB values belong only to their own GLB.  They do not need to match
 * MagicaVoxel colours used by any other weapon.
 */
export const SwordVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    LONGSWORD: {
        slots: [
            {index: 0, source: [127, 127, 127], role: 'blade dark'},
            {index: 1, source: [184, 184, 184], role: 'blade mid'},
            {index: 2, source: [218, 218, 218], role: 'blade highlight'},
            {index: 3, source: [34, 0, 0], role: 'grip dark'},
            {index: 4, source: [63, 0, 0], role: 'grip mid'},
            {index: 5, source: [103, 0, 0], role: 'grip highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [[54, 67, 82], [120, 144, 161], [194, 219, 232], [42, 18, 12], [91, 43, 25], [145, 76, 43]],
            // pyroxide
            [[76, 12, 17], [161, 37, 29], [255, 126, 58], [40, 12, 10], [88, 24, 16], [158, 53, 23]],
            // geonite
            [[13, 58, 45], [26, 132, 90], [101, 224, 158], [18, 38, 23], [41, 82, 43], [86, 142, 67]],
            // mythril
            [[6, 34, 105], [32, 126, 202], [111, 236, 255], [79, 49, 8], [175, 127, 24], [255, 221, 92]],
            // chaotite
            [[61, 10, 84], [157, 30, 169], [255, 98, 218], [39, 5, 52], [100, 14, 109], [201, 36, 174]],
        ],
    },

    BROADSWORD: {
        slots: [
            {index: 0, source: [127, 127, 127], role: 'blade dark'},
            {index: 1, source: [184, 184, 184], role: 'blade mid'},
            {index: 2, source: [218, 218, 218], role: 'blade highlight'},
            {index: 3, source: [34, 0, 0], role: 'grip dark'},
            {index: 4, source: [63, 0, 0], role: 'grip mid'},
            {index: 5, source: [103, 0, 0], role: 'grip highlight'},
        ],

        // materialId: 1 steel, 2 pyroxide, 3 geonite, 4 mythril, 5 chaotite
        materialColors: [
            // steel
            [[54, 67, 82], [120, 144, 161], [194, 219, 232], [42, 18, 12], [91, 43, 25], [145, 76, 43]],
            // pyroxide
            [[76, 12, 17], [161, 37, 29], [255, 126, 58], [40, 12, 10], [88, 24, 16], [158, 53, 23]],
            // geonite
            [[13, 58, 45], [26, 132, 90], [101, 224, 158], [18, 38, 23], [41, 82, 43], [86, 142, 67]],
            // mythril
            [[6, 34, 105], [32, 126, 202], [111, 236, 255], [79, 49, 8], [175, 127, 24], [255, 221, 92]],
            // chaotite
            [[61, 10, 84], [157, 30, 169], [255, 98, 218], [39, 5, 52], [100, 14, 109], [201, 36, 174]],
        ],
    },
}
