import { Vector3 } from '@babylonjs/core'
import { EquipSlotModelsCb } from '@/data/items/item'
import type { EquipModelModifier } from '@/babylon/item/equipManager'

const modifier = (position: Vector3, scale: Vector3, rotation = Vector3.Zero()): EquipModelModifier => ({
    position,
    rotation,
    scale,
})

/**
 * Additional model-local transforms used only by player character models.
 * The base transforms in ArmorModelsCb remain shared by ground items, decorations and monsters.
 */
export const CharacterModelEquipModifiers = new Map<number, EquipModelModifier>([
    // [EquipSlotModelsCb.ARMOR_PLATE.modelId, modifier(new Vector3(0, 0, 0), new Vector3(1, 1, 1.05))],

    [EquipSlotModelsCb.ARMOR_PLATE.modelId, modifier(new Vector3(0, -0.57, -0.01), new Vector3(1.6, 1.45, 1.75))],
    [EquipSlotModelsCb.HELM.modelId, modifier(new Vector3(0.005, 0.046, 0.015), new Vector3(0.9, 1, 1.05))],
    [EquipSlotModelsCb.SHIELD.modelId, modifier(new Vector3(0, 0, 0), new Vector3(1, 1, 1))],
    [EquipSlotModelsCb.PAULDRONS_PLATE.modelId, modifier(new Vector3(0, 0, 0), new Vector3(1, 1, 1))],
    [EquipSlotModelsCb.LEGS_PLATE.modelId, modifier(new Vector3(0.03, 0, -0.01), new Vector3(1.05, 1, 1.07))],
    [EquipSlotModelsCb.CHAIN_MAIL.modelId, modifier(new Vector3(0, 0, -0.015), new Vector3(1, 1, 1.14))],
    [EquipSlotModelsCb.CHAIN_COIF.modelId, modifier(new Vector3(0, 0.046, 0.015), new Vector3(0.875, 1, 1.05))],
    [EquipSlotModelsCb.CHAIN_PAULDRONS.modelId, modifier(new Vector3(0, 0, 0), new Vector3(1, 1, 1))],
    [EquipSlotModelsCb.CHAIN_GREAVES.modelId, modifier(new Vector3(0.03, 0, -0.01), new Vector3(1.05, 1, 1.07))],
])

export const getCharacterModelEquipModifier = (modelId: number): EquipModelModifier | null => {
    return CharacterModelEquipModifiers.get(modelId) ?? null
}
