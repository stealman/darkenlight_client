import { BOW_WEAPON_MATERIAL_NAMES, VertexColorWeaponPalette } from './types'

const BOW_VERTEX_COLOR_PALETTE: VertexColorWeaponPalette = {
    materialNames: BOW_WEAPON_MATERIAL_NAMES,
    materialColorSpace: 'srgb',
    slots: [
        {index: 0, source: [23, 23, 23], role: 'string dark'},
        {index: 1, source: [11, 8, 5], role: 'wood deepest shadow'},
        {index: 2, source: [14, 9, 3], role: 'wood dark'},
        {index: 3, source: [40, 23, 7], role: 'wood mid'},
        {index: 4, source: [47, 47, 47], role: 'string mid'},
        {index: 5, source: [78, 43, 17], role: 'wood highlight'},
        {index: 6, source: [63, 63, 63], role: 'string highlight'},
    ],

    // Sampled from the six inventory log icons. Ebony is materialId 6 so the
    // existing elven and ethereal material IDs remain stable.
    materialColors: [
        // wooden
        [[145, 112, 72], [62, 50, 34], [88, 68, 44], [120, 94, 60], [198, 170, 112], [154, 124, 80], [214, 194, 144]],
        // cherrywood
        [[156, 72, 36], [48, 12, 12], [84, 24, 24], [120, 48, 24], [204, 132, 72], [180, 84, 48], [216, 168, 96]],
        // mahogany
        [[150, 130, 48], [48, 48, 16], [88, 76, 28], [126, 108, 34], [220, 190, 82], [184, 158, 56], [222, 210, 98]],
        // elven
        [[96, 108, 48], [36, 36, 24], [72, 72, 36], [108, 120, 48], [168, 192, 84], [120, 132, 48], [168, 216, 120]],
        // ethereal
        [[108, 108, 108], [60, 60, 60], [84, 84, 84], [120, 120, 120], [180, 180, 180], [156, 156, 156], [216, 216, 216]],
        // ebony (materialId 6)
        [[96, 48, 12], [24, 0, 0], [48, 12, 0], [72, 24, 0], [144, 96, 36], [120, 60, 12], [156, 132, 60]],
    ],
}

/** Local vertex-colour palettes for bow models sharing the exported source ramp. */
export const BowVertexColorPalettes: Record<string, VertexColorWeaponPalette> = {
    HUNTING_BOW: BOW_VERTEX_COLOR_PALETTE,
    RECURVE_BOW: BOW_VERTEX_COLOR_PALETTE,
    BATTLE_BOW: BOW_VERTEX_COLOR_PALETTE,
}
