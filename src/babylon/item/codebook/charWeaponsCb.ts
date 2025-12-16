import { CharWearableItemModel } from '@/babylon/item/charEquipManager'
import { Vector3 } from '@babylonjs/core'

export const CharWeaponsCbManager = {
    weaponModels: new Map() as Map<number, CharWearableItemModel>,

    initialize() {
        this.initBasicMetalArmorModels()
    },

    initBasicMetalArmorModels() {
        this.weaponModels.set(1, new CharWearableItemModel("steel_broadsword", 1, "broadsword_steel.glb", new Vector3(2, 1, 1), Vector3.Zero(), new Vector3(Math.PI / 2, Math.PI / 2, 0)))
    }
}

