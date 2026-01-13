import { Materials } from '@/babylon/materials'
import { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { MobEquipItemType} from '@/babylon/item/mobEquipManager'
import { MobEquipItemData } from '@/babylon/item/codebook/mobEquipItemData'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Renderer } from '@/babylon/scene/renderer'

export const BASE_EQUIP_MATERIAL_PATH = "/models/equip/"
export const PLATE_METAL_BASIC = 'plate-metal-basic'

export const MobArmorsCbManager = {
    BASE_ARMORS_PATH: 'armors/',
    itemSourceParent: null as TransformNode | null,

    materialSets: new Map() as Map<string, PBRCustomMaterial>,

    async initArmors(map: Map<number, MobEquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobArmorSources", scene)
        this.materialSets.set(PLATE_METAL_BASIC, this.getMaterial("plate-metal-basic", PLATE_METAL_BASIC, 4, 4, false))

        map.set(CbArmorTypes.PLATE_ARMOR_MALE.id, await this.getItem(CbArmorTypes.PLATE_ARMOR_MALE))

        map.set(CbArmorTypes.HELM_MALE.id, await this.getItem(CbArmorTypes.HELM_MALE))
        map.set(CbArmorTypes.HELM_MALE_CLOSED.id, await this.getItem(CbArmorTypes.HELM_MALE_CLOSED))

        map.set(CbArmorTypes.PAULDRON_MALE.id, await this.getItem(CbArmorTypes.PAULDRON_MALE))

        map.set(CbArmorTypes.LEG_MALE.id, await this.getItem(CbArmorTypes.LEG_MALE))
    },

    async getItem(data: MobEquipItemData): Promise<MobEquipItemType> {
        const item = new MobEquipItemType(data)
        const material = this.materialSets.get(data.materialSetName)!
        await item.initializeMesh(this.itemSourceParent!, Renderer.scene!, this.BASE_ARMORS_PATH + data.model + ".babylon", material, data.pos, data.rot, data.scale)
        return item
    },

    getMaterial(texture: string, name: string, matsX: number, matsY: number, hasAlpha: boolean = false) {
        return Materials.getPBRCustomMaterialFrom(Renderer.scene!, texture, BASE_EQUIP_MATERIAL_PATH + this.BASE_ARMORS_PATH, texture + ".png", 1 / (matsX * 2), 1 / (matsY * 2), hasAlpha, {
            metallic: 1.0,
            roughness: 0.75,
            directIntensity: 1.5,
            environmentIntensity: 1,
        })
    }
}

export const CbArmorTypes = {
    PLATE_ARMOR_MALE: new MobEquipItemData(100, "100_male-armor-plate", "male-armor-plate", PLATE_METAL_BASIC, new Vector3(-0.01, 0.65, 0.03), new Vector3(0.42, 0.42, 0.44),
        4, 4, false, null),

    HELM_MALE: new MobEquipItemData(200, "200_male-helmet", "male-helmet", PLATE_METAL_BASIC, new Vector3(0, 0.47, 0), BabylonUtils.getSymVector(0.44),
        4, 4, false, null),

    HELM_MALE_CLOSED: new MobEquipItemData(210, "210_male-helmet-closed", "male-helmet_closed", PLATE_METAL_BASIC, new Vector3(0, 0.42, 0), BabylonUtils.getSymVector(0.44),
        4, 4, false, null),

    PAULDRON_MALE: new MobEquipItemData(300, "300_male-pauldron", "male-pauldron-plate", PLATE_METAL_BASIC, new Vector3(0.06, -0.13, 0.02), new Vector3(0.48, 0.48, 0.58),
        4, 4, false, null),

    LEG_MALE: new MobEquipItemData(400, "400_male-leg-plate", "male-leg-plate", PLATE_METAL_BASIC, new Vector3(-0.01, -0.1, 0.01), new Vector3(0.26, 0.26, 0.23),
        4, 4, false, null),
}
