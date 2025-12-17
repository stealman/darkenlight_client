import { CharWearableItemModel } from '@/babylon/item/charEquipManager'
import { Vector3 } from '@babylonjs/core'

export const CharWeaponsCbManager = {
    weaponModels: new Map() as Map<number, CharWearableItemModel>,

    initialize() {
        this.initWeaponCodebook()
    },

    initWeaponCodebook() {
        this.weaponModels.set(1, new CharWearableItemModel("steel_broadsword", 1, "broadsword_steel.glb", new Vector3(1.5, 1, 1), Vector3.Zero(), new Vector3(Math.PI / 2, Math.PI / 2, 0)))
        this.weaponModels.set(2, new CharWearableItemModel("steel_longsword", 2, "longsword_steel.glb", new Vector3(1.5, 1, 1), Vector3.Zero(), new Vector3(Math.PI / 2, Math.PI / 2, 0)))
    }
}

