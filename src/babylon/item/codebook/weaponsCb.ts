import { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { EquipItemType } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { Renderer } from '@/babylon/scene/renderer'

export const WeaponsCbManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    itemSourceParent: null as TransformNode | null,

    async initMelee(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobWeaponSources", scene)
        map.set(WeaponsCb.LONGSWORD.id, await this.getItem(WeaponsCb.LONGSWORD))
        map.set(WeaponsCb.BROADSWORD.id, await this.getItem(WeaponsCb.BROADSWORD))
        map.set(WeaponsCb.BOW.id, await this.getItem(WeaponsCb.BOW))
    },

    async getItem(data: EquipCbItem) {
        const item = new EquipItemType(data)
        await item.initializeMeshWeapon(this.itemSourceParent!, Renderer.scene, this.BASE_WEAPONS_PATH + data.model + ".glb", null, data.pos, data.rot, data.scale)
        return item
    },
}

export const WeaponsCb = {
    LONGSWORD: new EquipCbItem(1, "longsword_steel", Vector3.Zero(), new Vector3(0.32, 0.22, 0.22), new Vector3(0, 2.4, 0)),

    BROADSWORD: new EquipCbItem(2, "broadsword_steel", Vector3.Zero(), new Vector3(0.32, 0.22, 0.22), new Vector3(0, 2, 0)),

    BOW: new EquipCbItem(3, "bow2", new Vector3(-0.1, 0, 0), new Vector3(0.16, 0.22, 0.3), new Vector3(0, 2, 0)),
}
