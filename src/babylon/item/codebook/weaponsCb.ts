import { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { MobEquipItemType } from '@/babylon/item/equipManager'
import { EquipItemData } from '@/babylon/item/codebook/equipItemData'
import { Renderer } from '@/babylon/scene/renderer'

export const WeaponsCbManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    itemSourceParent: null as TransformNode | null,

    async initMelee(map: Map<number, MobEquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobWeaponSources", scene)
        map.set(WeaponsCb.LONGSWORD.id, await this.getItem(WeaponsCb.LONGSWORD))
        map.set(WeaponsCb.BROADSWORD.id, await this.getItem(WeaponsCb.BROADSWORD))
    },

    async getItem(data: EquipItemData) {
        const item = new MobEquipItemType(data)
        await item.initializeMeshWeapon(this.itemSourceParent!, Renderer.scene, this.BASE_WEAPONS_PATH + data.model + ".glb", null, data.pos, data.rot, data.scale)
        return item
    },
}

export const WeaponsCb = {
    LONGSWORD: new EquipItemData(1, "sword_steel", "longsword_steel","", Vector3.Zero(), new Vector3(0.32, 0.22, 0.22),
       0, 0, false, new Vector3(0, 2.4, 0)),

    BROADSWORD: new EquipItemData(2, "broadsword_steel", "broadsword_steel","", Vector3.Zero(), new Vector3(0.32, 0.22, 0.22),
        0, 0, false, new Vector3(0, 2, 0)),
}
