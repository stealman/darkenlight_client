import { BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/charEquipManager'
import { Materials } from '@/babylon/materials'
import { Scene, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { CbEquipItemData } from '@/babylon/item/codebook/cbEquipItemData'
import { EquipItemType } from '@/babylon/item/monsterEquipManager'

export const CbWeaponsManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    scene: null as Scene | null,

    async initMelee(map: Map<number, EquipItemType>, scene: Scene) {
        this.scene = scene
        map.set(CbWeapons.LONGSWORD.id, await this.getItem(CbWeapons.LONGSWORD))
    },

    async getItem(data: CbEquipItemData) {
        const item = new EquipItemType(data)
        const material = this.getMaterial(data.texture, data.matsX, data.matsY, data.hasAlpha)
        await item.initializeMesh(this.scene!, this.BASE_WEAPONS_PATH + data.model, material, data.pos, data.rot, data.scale)
        return item
    },

    getMaterial(texture: string, matsX: number, matsY: number, hasAlpha: boolean = false) {
        return Materials.getCustomMaterialFrom(this.scene!, texture, BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH, texture + ".png", 1 / (matsX * 2), 1 / (matsY * 2), hasAlpha)
    }
}

export const CbWeapons = {
    LONGSWORD: new CbEquipItemData(1, "1_longsword", null,null, new Vector3(0.01, 0.1, 0), new Vector3(0, Math.PI / 2, Math.PI / 2), BabylonUtils.getSymVector(5), 2, 1),
}
