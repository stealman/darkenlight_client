import { Materials } from '@/babylon/materials'
import { Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemType} from '@/babylon/item/equipManager'
import { EquipCbItem} from '@/babylon/item/codebook/equipCbItem'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Renderer } from '@/babylon/scene/renderer'
import { EquipSlotsCb } from '@/data/items/item'

export const BASE_EQUIP_MATERIAL_PATH = "/models/equip/"
export const ARMOR_MATERIAL_METALIC = 'materials-metalic'

const matMetalSize = new Vector2(16, 8)

export const ArmorsCbManager = {
    matMetal: null as PBRCustomMaterial,
    itemSourceParent: null as TransformNode | null,

    async initArmors(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobArmorSources", scene)

        // Load materials
        this.matMetal = this.getMaterial(ARMOR_MATERIAL_METALIC, matMetalSize)

        // Init all armor types
        map.set(ArmorModelsCb.PLATE_ARMOR_MALE.id, await this.getItem(ArmorModelsCb.PLATE_ARMOR_MALE, this.matMetal))

        map.set(ArmorModelsCb.HELM_MALE.id, await this.getItem(ArmorModelsCb.HELM_MALE, this.matMetal))
        map.set(ArmorModelsCb.HELM_MALE_CLOSED.id, await this.getItem(ArmorModelsCb.HELM_MALE_CLOSED, this.matMetal))

        map.set(ArmorModelsCb.PAULDRON_MALE.id, await this.getItem(ArmorModelsCb.PAULDRON_MALE, this.matMetal))

        map.set(ArmorModelsCb.LEG_MALE.id, await this.getItem(ArmorModelsCb.LEG_MALE, this.matMetal))
    },

    async getItem(data: EquipCbItem, material: PBRCustomMaterial): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        await item.initializeMeshArmor(this.itemSourceParent!, Renderer.scene!, "armors/" + data.model + ".babylon", material, data.pos, data.rot, data.scale)
        return item
    },

    getMaterial(texture: string, matSize: Vector2) {
        const mat = Materials.getPBRCustomMaterialFrom(Renderer.scene!, texture, BASE_EQUIP_MATERIAL_PATH + "armors/", texture + ".png", 1 / (matSize.x), 1 / (matSize.y), false, {
            metallic: 1.0,
            roughness: 0.75,
            directIntensity: 1.5,
            environmentIntensity: 1,
        })
        return mat
    }
}

export const ArmorModelsCb = {
    PLATE_ARMOR_MALE: new EquipCbItem(EquipSlotsCb.ARMOR_PLATE.modelId, "male-armor-plate", new Vector3(-0.01, 0.65, 0.03), new Vector3(0.42, 0.42, 0.44), null, matMetalSize),

    HELM_MALE: new EquipCbItem(EquipSlotsCb.HELM.modelId, "male-helmet", new Vector3(0, 0.47, 0), BabylonUtils.getSymVector(0.45), null, matMetalSize),
    HELM_MALE_CLOSED: new EquipCbItem(EquipSlotsCb.HELM_CLOSED.modelId, "male-helmet_closed", new Vector3(0, 0.42, 0), BabylonUtils.getSymVector(0.45), null, matMetalSize),

    PAULDRON_MALE: new EquipCbItem(EquipSlotsCb.PAULDRONS_PLATE.modelId, "male-pauldron-plate", new Vector3(0.06, -0.15, 0.02), new Vector3(0.48, 0.48, 0.58), null, matMetalSize),

    LEG_MALE: new EquipCbItem(EquipSlotsCb.LEGS_PLATE.modelId, "male-leg-plate", new Vector3(-0.01, -0.1, 0.01), new Vector3(0.26, 0.26, 0.23),null, matMetalSize),
}
