import { Vector3 } from '@babylonjs/core'
import { EquipSlotModelsCb } from '@/data/items/item'
import type { EquipModelModifier } from '@/babylon/item/equipManager'
import { getArmorEquipScale } from '@/babylon/item/codebook/armorEquipScales'

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
 * Additional model-local transforms used by player character models.
 * Ground items reuse only their scale so the same source mesh keeps a comparable size.
 */
export const CharacterModelEquipModifiers = new Map<number, EquipModelModifier>([
    [EquipSlotModelsCb.ARMOR_PLATE.modelId, modifier(new Vector3(0, -0.58, -0.02), getArmorEquipScale(EquipSlotModelsCb.ARMOR_PLATE.modelId)!, new Vector3(0.02, 0, 0))],
    [EquipSlotModelsCb.HELM.modelId, modifier(new Vector3(0.005, -0.35, 0), getArmorEquipScale(EquipSlotModelsCb.HELM.modelId)!)],

    [EquipSlotModelsCb.SHIELD.modelId, modifier(new Vector3(0.075, -0.02, -0.05), getArmorEquipScale(EquipSlotModelsCb.SHIELD.modelId)!)],
    [EquipSlotModelsCb.LEGS_PLATE.modelId, modifier(new Vector3(0.088, 0.72, -0.05), getArmorEquipScale(EquipSlotModelsCb.LEGS_PLATE.modelId)!, new Vector3(3.2, 1.57, 0.04))],

    [EquipSlotModelsCb.CHAIN_MAIL.modelId, modifier(new Vector3(0, -0.56, -0.02), getArmorEquipScale(EquipSlotModelsCb.CHAIN_MAIL.modelId)!, new Vector3(0.02, 0, 0))],
    [EquipSlotModelsCb.CHAIN_COIF.modelId, modifier(new Vector3(0.005, -0.37, 0.07), getArmorEquipScale(EquipSlotModelsCb.CHAIN_COIF.modelId)!)],
    [EquipSlotModelsCb.CHAIN_GREAVES.modelId, modifier(new Vector3(0.09, 0.72, -0.045), getArmorEquipScale(EquipSlotModelsCb.CHAIN_GREAVES.modelId)!, new Vector3(3.2, 1.58, 0.03))],
])

export const CharacterModelPauldronModifiers = new Map<number, CharacterPauldronModifiers>([
    [EquipSlotModelsCb.PAULDRONS_PLATE.modelId, {
        left: modifier(new Vector3(-0.1, 0.25, 0.13), getArmorEquipScale(EquipSlotModelsCb.PAULDRONS_PLATE.modelId)!, new Vector3(2.95, 1.7, 0.09)),
        right: modifier(new Vector3(-0.1, 0.25, 0.13), getArmorEquipScale(EquipSlotModelsCb.PAULDRONS_PLATE.modelId)!, new Vector3(2.95, 1.7, 0.09)),
    }],
    [EquipSlotModelsCb.CHAIN_PAULDRONS.modelId, {
        left: modifier(new Vector3(-0.09, 0.25, 0.15), getArmorEquipScale(EquipSlotModelsCb.CHAIN_PAULDRONS.modelId)!, new Vector3(3, 1.65, -0.1)),
        right: modifier(new Vector3(-0.09, 0.25, 0.12), getArmorEquipScale(EquipSlotModelsCb.CHAIN_PAULDRONS.modelId)!, new Vector3(3, 1.65, -0.1)),
    }],
])

export const getCharacterModelEquipModifier = (modelId: number, pauldronSide?: CharacterPauldronSide): EquipModelModifier | null => {
    if (pauldronSide != null) {
        return CharacterModelPauldronModifiers.get(modelId)?.[pauldronSide] ?? null
    }
    return CharacterModelEquipModifiers.get(modelId) ?? null
}
