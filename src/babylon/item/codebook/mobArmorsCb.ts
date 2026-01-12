import { BASE_EQUIP_MATERIAL_PATH, PLATE_METAL_BASIC } from '@/babylon/item/charEquipManager'
import { Materials } from '@/babylon/materials'
import { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { MobEquipItemType } from '@/babylon/item/mobEquipManager'
import { MobEquipItemData } from '@/babylon/item/codebook/mobEquipItemData'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Renderer } from '@/babylon/scene/renderer'

export const MobArmorsCbManager = {
    BASE_ARMORS_PATH: 'armors/',
    itemSourceParent: null as TransformNode | null,
    materialSets: new Map() as Map<string, PBRCustomMaterial>,

    async initArmors(map: Map<number, MobEquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobArmorSources", scene)
        this.materialSets.set(PLATE_METAL_BASIC, this.getMaterial("plate-metal-basic", PLATE_METAL_BASIC, 4, 4, false))

        map.set(CbHelmets.PLATE_ARMOR_SKELETON.id, await this.getItem(CbHelmets.PLATE_ARMOR_SKELETON))
        map.set(CbHelmets.HELM_SKELETON.id, await this.getItem(CbHelmets.HELM_SKELETON))
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

export const CbHelmets = {
    PLATE_ARMOR_SKELETON: new MobEquipItemData(1100, "1100_armor_skeleton", "male-armor-plate", PLATE_METAL_BASIC, new Vector3(0, 0.45, 0), new Vector3(0, Math.PI / 2, 0), new Vector3(0.36, 0.20, 0.3),
        4, 4, false, null),
    HELM_SKELETON: new MobEquipItemData(1850, "1850_helm_skeleton", "male-helmet", PLATE_METAL_BASIC, new Vector3(0, 0.45, 0), new Vector3(0, Math.PI / 2, 0), BabylonUtils.getSymVector(0.40),
        4, 4, false, null),
}
