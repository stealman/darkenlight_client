import { BOW_WEAPON_MATERIAL_NAMES, VertexColorWeaponPalette } from './types'

/** Local vertex-colour palettes for bow models. */
export const BowVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    HUNTING_BOW: {
        materialNames: BOW_WEAPON_MATERIAL_NAMES,
        slots: [
            {index: 0, source: [23, 23, 23], role: 'string dark'},
            {index: 1, source: [11, 8, 5], role: 'wood deepest shadow'},
            {index: 2, source: [14, 9, 3], role: 'wood dark'},
            {index: 3, source: [40, 23, 7], role: 'wood mid'},
            {index: 4, source: [47, 47, 47], role: 'string mid'},
            {index: 5, source: [78, 43, 17], role: 'wood highlight'},
            {index: 6, source: [63, 63, 63], role: 'string highlight'},
        ],

        // materialId: 1 wooden, 2 cherrywood, 3 mahogany, 4 elven, 5 ethereal
        materialColors: [
            // wooden: exact colours exported by the artist
            [[58, 52, 45], [33, 22, 12], [52, 31, 12], [74, 46, 19], [100, 92, 83], [126, 75, 33], [147, 138, 126]],
            // cherrywood
            [[32, 18, 14], [35, 7, 5], [63, 14, 8], [126, 35, 21], [70, 38, 28], [213, 79, 44], [109, 64, 43]],
            // mahogany
            [[28, 13, 10], [24, 5, 3], [45, 9, 5], [91, 24, 14], [58, 27, 18], [158, 55, 27], [92, 51, 31]],
            // elven
            [[22, 45, 37], [8, 31, 21], [13, 57, 34], [32, 119, 70], [49, 91, 70], [104, 206, 115], [83, 143, 106]],
            // ethereal
            [[36, 15, 61], [22, 6, 45], [39, 10, 76], [102, 35, 164], [82, 43, 128], [202, 101, 255], [140, 96, 209]],
        ],
    },
}
