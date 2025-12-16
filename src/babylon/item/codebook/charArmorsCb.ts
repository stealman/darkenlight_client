import { CharWearableItemModel } from '@/babylon/item/charEquipManager'
import { Vector3 } from '@babylonjs/core'

export const CharArmorsCbManager = {
    BASE_ARMORS_PATH: 'armors/',
    basicMetalArmorModels: [] as CharWearableItemModel[],

    initialize() {
        this.initBasicMetalArmorModels()
    },

    initBasicMetalArmorModels() {
        this.basicMetalArmorModels = [
            new CharWearableItemModel("male-plate-armor", 10, this.BASE_ARMORS_PATH + "male-armor-plate.babylon", new Vector3(0.42, 0.42, 0.44), new Vector3(-0.01, 0.65, 0.03)),
            new CharWearableItemModel("male-plate-helm1", 20, this.BASE_ARMORS_PATH + "male-helmet.babylon", new Vector3(0.46, 0.46, 0.46), new Vector3(0, 0.42, 0)),
            new CharWearableItemModel("male-plate-helm2", 30, this.BASE_ARMORS_PATH + "male-helmet_closed.babylon", new Vector3(0.46, 0.46, 0.46), new Vector3(0, 0.42, 0)),
            new CharWearableItemModel("male-plate-pauldron-left", 40, this.BASE_ARMORS_PATH + "male-pauldron-plate.babylon", new Vector3(0.48, 0.48, 0.54), new Vector3(-0.01, -0.13, 0.065), new Vector3(0, -Math.PI / 2, 0)),
            new CharWearableItemModel("male-plate-pauldron-right", 50, this.BASE_ARMORS_PATH + "male-pauldron-plate.babylon", new Vector3(0.48, 0.48, 0.54), new Vector3(-0.01, -0.13, -0.05), new Vector3(0, Math.PI / 2, 0)),
            new CharWearableItemModel("male-plate-legs", 60, this.BASE_ARMORS_PATH + "male-leg-plate.babylon", new Vector3(0.26, 0.26, 0.23), new Vector3(-0.01, -0.1, 0.01))
        ]
    }
}

