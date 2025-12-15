import { BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/charEquipManager'
import { Materials } from '@/babylon/materials'
import { Scene, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { MobEquipItemType } from '@/babylon/item/mobEquipManager'
import { MobEquipItemData } from '@/babylon/item/codebook/mobEquipItemData'

export const MobArmorsCbManager = {
    BASE_ARMORS_PATH: 'armors/',
    scene: null as Scene | null,

    async initHelmets(map: Map<number, MobEquipItemType>, scene: Scene) {
        this.scene = scene
        map.set(CbHelmets.PLATE_ARMOR_SKELETON.id, await this.getItem(CbHelmets.PLATE_ARMOR_SKELETON))
        map.set(CbHelmets.HELM_SKELETON.id, await this.getItem(CbHelmets.HELM_SKELETON))
    },

    async getItem(data: MobEquipItemData) {
        const item = new MobEquipItemType(data)
        const material = this.getMaterial(data.texture, data.matsX, data.matsY, data.hasAlpha)
        await item.initializeMesh(this.scene!, this.BASE_ARMORS_PATH + data.model, material, data.pos, data.rot, data.scale)
        return item
    },

    getMaterial(texture: string, matsX: number, matsY: number, hasAlpha: boolean = false) {
        return Materials.getPBRCustomMaterial(this.scene!, texture, BASE_EQUIP_MATERIAL_PATH + this.BASE_ARMORS_PATH, texture + ".png", 1 / (matsX * 2), 1 / (matsY * 2), hasAlpha)
    }
}

export const CbHelmets = {
    PLATE_ARMOR_SKELETON: new MobEquipItemData(1100, "1100_armor_skeleton", "male-armor-plate", "plate-metal-basic", new Vector3(0, 0.45, 0), new Vector3(0, Math.PI / 2, 0), new Vector3(0.36, 0.20, 0.3), 4, 4),
    HELM_SKELETON: new MobEquipItemData(1850, "1850_helm_skeleton", "male-helmet", "plate-metal-basic", new Vector3(0, 0.45, 0), new Vector3(0, Math.PI / 2, 0), BabylonUtils.getSymVector(0.40), 4, 4),
}
