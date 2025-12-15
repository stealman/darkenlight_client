import { BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/charEquipManager'
import { Materials } from '@/babylon/materials'
import { Scene, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { MobEquipItemType } from '@/babylon/item/mobEquipManager'
import { MobEquipItemData } from '@/babylon/item/codebook/mobEquipItemData'

export const MobWeaponsCbManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    scene: null as Scene | null,

    async initMelee(map: Map<number, MobEquipItemType>, scene: Scene) {
        this.scene = scene
       // map.set(MobWeaponsCb.LONGSWORD.id, await this.getItem(MobWeaponsCb.LONGSWORD))
    },

    async getItem(data: MobEquipItemData) {
        const item = new MobEquipItemType(data)
        const material = this.getMaterial(data.texture, data.matsX, data.matsY, data.hasAlpha)
        await item.initializeMesh(this.scene!, this.BASE_WEAPONS_PATH + data.model, material, data.pos, data.rot, data.scale)
        return item
    },

    getMaterial(texture: string, matsX: number, matsY: number, hasAlpha: boolean = false) {
        return Materials.getPBRCustomMaterial(this.scene!, texture, BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH, texture + ".png", 1 / (matsX * 2), 1 / (matsY * 2), hasAlpha)
    }
}

export const MobWeaponsCb = {
    //LONGSWORD: new MobEquipItemData(1, "sword_steel", null,null, new Vector3(0.01, 0.1, 0), new Vector3(0, Math.PI / 2, Math.PI / 2), BabylonUtils.getSymVector(5), 2, 1),
}
