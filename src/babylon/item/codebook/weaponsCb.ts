import { Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { EquipItemType } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { Renderer } from '@/babylon/scene/renderer'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Materials } from '@/babylon/materials'
import { BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/codebook/armorsCb'

const matBowSize = new Vector2(4, 1)

export const WeaponsCbManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    itemSourceParent: null as TransformNode | null,

    bowMaterial: null as PBRCustomMaterial | null,

    async initMelee(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobWeaponSources", scene)

        // Load materials
        this.bowMaterial = this.getMaterial("bow", matBowSize)

        map.set(WeaponsCb.LONGSWORD.id, await this.getItem(WeaponsCb.LONGSWORD, null))
        map.set(WeaponsCb.BROADSWORD.id, await this.getItem(WeaponsCb.BROADSWORD, null))
        map.set(WeaponsCb.BOW.id, await this.getItem(WeaponsCb.BOW, this.bowMaterial))
    },

    async getItem(data: EquipCbItem, material: PBRCustomMaterial | null = null): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        await item.initializeMeshWeapon(this.itemSourceParent!, Renderer.scene, this.BASE_WEAPONS_PATH + data.model + ".glb", material, data.pos, data.rot, data.scale)
        return item
    },

    getMaterial(texture: string, matSize: Vector2) {
        const mat = Materials.getPBRCustomMaterialFrom(Renderer.scene!, texture, BASE_EQUIP_MATERIAL_PATH + "weapons/", texture + ".png", 1 / matSize.x, 1 / matSize.y, false, {
            metallic: 0.25,
            roughness: 1,
            directIntensity: 1.5,
            environmentIntensity: 1,
        })
        mat.albedoTexture.vScale = - mat.albedoTexture.vScale
        return mat
    },
}

export const WeaponsCb = {
    LONGSWORD: new EquipCbItem(1, "longsword_steel", Vector3.Zero(), new Vector3(0.32, 0.22, 0.22), new Vector3(0, 2.4, 0), null),

    BROADSWORD: new EquipCbItem(2, "broadsword_steel", Vector3.Zero(), new Vector3(0.32, 0.22, 0.22), new Vector3(0, 2, 0), null),

    BOW: new EquipCbItem(3, "bow", new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.4), new Vector3(0, 2, 0), matBowSize),
}
