import { Materials } from '@/babylon/materials'
import { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemType} from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Renderer } from '@/babylon/scene/renderer'

export const BASE_EQUIP_MATERIAL_PATH = "/models/equip/"
export const ARMOR_MATERIAL_METALIC = 'materials-metalic'

export const ArmorsCbManager = {
    matMetal: null as PBRCustomMaterial ,
    itemSourceParent: null as TransformNode | null,

    async initArmors(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobArmorSources", scene)
        this.matMetal = this.getMaterial(ARMOR_MATERIAL_METALIC, ARMOR_MATERIAL_METALIC, 16, 8)

        map.set(CbArmorTypes.PLATE_ARMOR_MALE.id, await this.getItem(CbArmorTypes.PLATE_ARMOR_MALE, this.matMetal))

        map.set(CbArmorTypes.HELM_MALE.id, await this.getItem(CbArmorTypes.HELM_MALE, this.matMetal))
        map.set(CbArmorTypes.HELM_MALE_CLOSED.id, await this.getItem(CbArmorTypes.HELM_MALE_CLOSED, this.matMetal))

        map.set(CbArmorTypes.PAULDRON_MALE.id, await this.getItem(CbArmorTypes.PAULDRON_MALE, this.matMetal))

        map.set(CbArmorTypes.LEG_MALE.id, await this.getItem(CbArmorTypes.LEG_MALE, this.matMetal))
    },

    async getItem(data: EquipCbItem, material: PBRCustomMaterial): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        await item.initializeMeshArmor(this.itemSourceParent!, Renderer.scene!, "armors/" + data.model + ".babylon", material, data.pos, data.rot, data.scale)
        return item
    },

    getMaterial(texture: string, name: string, matCols: number, matRows: number) {
        return Materials.getPBRCustomMaterialFrom(Renderer.scene!, texture, BASE_EQUIP_MATERIAL_PATH + "armors/", texture + ".png", 1 / (matCols * 2), 1 / (matRows * 2), false, {
            metallic: 1.0,
            roughness: 0.75,
            directIntensity: 1.5,
            environmentIntensity: 1,
        })
    }
}

export const CbArmorTypes = {
    PLATE_ARMOR_MALE: new EquipCbItem(100, "male-armor-plate", new Vector3(-0.01, 0.65, 0.03), new Vector3(0.42, 0.42, 0.44), null),

    HELM_MALE: new EquipCbItem(200, "male-helmet", new Vector3(0, 0.47, 0), BabylonUtils.getSymVector(0.45), null),
    HELM_MALE_CLOSED: new EquipCbItem(210, "male-helmet_closed", new Vector3(0, 0.42, 0), BabylonUtils.getSymVector(0.45), null),

    PAULDRON_MALE: new EquipCbItem(300, "male-pauldron-plate", new Vector3(0.06, -0.13, 0.02), new Vector3(0.48, 0.48, 0.58), null),

    LEG_MALE: new EquipCbItem(400, "male-leg-plate", new Vector3(-0.01, -0.1, 0.01), new Vector3(0.26, 0.26, 0.23),null),
}
