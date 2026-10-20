import { Vector3 } from '@babylonjs/core'
import { EquipSlotModelsCb } from '@/data/items/item'
import type { EquipModelModifier } from '@/babylon/item/equipManager'

const modifier = (position: Vector3, scale: Vector3, rotation = Vector3.Zero()): EquipModelModifier => ({
    position,
    rotation,
    scale,
})

export type CharacterPauldronSide = 'left' | 'right'

export interface CharacterPauldronModifiers {
    left: EquipModelModifier
    right: EquipModelModifier
}

/**
 * Additional model-local transforms used only by player character models.
 * The base transforms in ArmorModelsCb remain shared by ground items, decorations and monsters.
 */
export const CharacterModelEquipModifiers = new Map<number, EquipModelModifier>([
    // [EquipSlotModelsCb.ARMOR_PLATE.modelId, modifier(new Vector3(0, 0, 0), new Vector3(1, 1, 1.05))],

    [EquipSlotModelsCb.ARMOR_PLATE.modelId, modifier(new Vector3(0, -0.58, -0.02), new Vector3(1.57, 1.45, 1.6), new Vector3(0.02, 0, 0))],

    // [EquipSlotModelsCb.HELM.modelId, modifier(new Vector3(0.005, 0.046, 0.015), new Vector3(0.9, 1, 1.05))],
    [EquipSlotModelsCb.HELM.modelId, modifier(new Vector3(0.005, -0.35, 0), new Vector3(2, 1.9, 2))],

    [EquipSlotModelsCb.SHIELD.modelId, modifier(new Vector3(0, 0, 0), new Vector3(1, 1, 1))],

    //[EquipSlotModelsCb.LEGS_PLATE.modelId, modifier(new Vector3(0.03, 0, -0.01), new Vector3(1.05, 1, 1.07))],
    [EquipSlotModelsCb.LEGS_PLATE.modelId, modifier(new Vector3(0.088, 0.72, -0.05), new Vector3(1.9, 1.3, 2), new Vector3(3.2, 1.57, 0.04))],

    //[EquipSlotModelsCb.CHAIN_MAIL.modelId, modifier(new Vector3(0, 0, -0.015), new Vector3(1, 1, 1.14))],
    [EquipSlotModelsCb.CHAIN_MAIL.modelId, modifier(new Vector3(0, -0.56, -0.02), new Vector3(1.35, 1.45, 1.6), new Vector3(0.02, 0, 0))],

    //[EquipSlotModelsCb.CHAIN_COIF.modelId, modifier(new Vector3(0, 0.046, 0.015), new Vector3(0.875, 1, 1.05))],
    [EquipSlotModelsCb.CHAIN_COIF.modelId, modifier(new Vector3(0.005, -0.37, 0.07), new Vector3(2, 1.9, 2.05))],

    //[EquipSlotModelsCb.CHAIN_GREAVES.modelId, modifier(new Vector3(0.03, 0, -0.01), new Vector3(1.05, 1, 1.07))],
    [EquipSlotModelsCb.CHAIN_GREAVES.modelId, modifier(new Vector3(0.09, 0.72, -0.045), new Vector3(1.65, 1.3, 2.25), new Vector3(3.2, 1.58, 0.03))],
])

export const CharacterModelPauldronModifiers = new Map<number, CharacterPauldronModifiers>([
    [EquipSlotModelsCb.PAULDRONS_PLATE.modelId, {
        left: modifier(new Vector3(-0.1, 0.25, 0.13), new Vector3(2.45, 1.3, 1.8), new Vector3(2.95, 1.7, 0.09)),
        right: modifier(new Vector3(-0.1, 0.25, 0.13), new Vector3(2.45, 1.3, 1.8), new Vector3(2.95, 1.7, 0.09)),
    }],
    [EquipSlotModelsCb.CHAIN_PAULDRONS.modelId, {
        left: modifier(new Vector3(-0.09, 0.25, 0.15), new Vector3(2.2, 1.3, 1.8), new Vector3(3, 1.65, -0.1)),
        right: modifier(new Vector3(-0.09, 0.25, 0.12), new Vector3(2.2, 1.3, 1.8), new Vector3(3, 1.65, -0.1)),
    }],
])

export const getCharacterModelEquipModifier = (modelId: number, pauldronSide?: CharacterPauldronSide): EquipModelModifier | null => {
    if (pauldronSide != null) {
        return CharacterModelPauldronModifiers.get(modelId)?.[pauldronSide] ?? null
    }
    return CharacterModelEquipModifiers.get(modelId) ?? null
}
