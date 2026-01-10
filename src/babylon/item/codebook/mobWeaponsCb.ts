import { Scene, TransformNode, Vector3 } from '@babylonjs/core'
import { MobEquipItemType } from '@/babylon/item/mobEquipManager'
import { MobEquipItemData } from '@/babylon/item/codebook/mobEquipItemData'

export const MobWeaponsCbManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    scene: null as Scene | null,
    itemSourceParent: null as TransformNode | null,

    async initMelee(map: Map<number, MobEquipItemType>, scene: Scene) {
        this.scene = scene
        this.itemSourceParent = new TransformNode("mobWeaponSources", this.scene)
        map.set(MobWeaponsCb.LONGSWORD.id, await this.getItem(MobWeaponsCb.LONGSWORD))
    },

    async getItem(data: MobEquipItemData) {
        const item = new MobEquipItemType(data)
        await item.initializeMeshWeapon(this.itemSourceParent!, this.scene!, this.BASE_WEAPONS_PATH + data.model + ".glb", null, data.pos, data.rot, data.scale)
        return item
    },
}

export const MobWeaponsCb = {
   LONGSWORD: new MobEquipItemData(1, "sword_steel", "longsword_steel","",
       Vector3.Zero(), new Vector3(Math.PI / 2, Math.PI / 2, 0), new Vector3(1.5, 1, 1) , 0, 0, false,
       new Vector3(0, 10.5, 0)),
}
