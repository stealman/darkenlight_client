import { Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { EquipItemType } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { Renderer } from '@/babylon/scene/renderer'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Materials } from '@/babylon/materials'
import { BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/codebook/armorsModelsCb'
import { EquipSlotModelsCb } from '@/data/items/item'

const matBowSize = new Vector2(4, 1)
const matLongswordSize = new Vector2(4, 1)
const matBroadswordSize = new Vector2(4, 1)
const matPickaxeSize = new Vector2(4, 1)
const matGreatAxeSize = new Vector2(4, 1)

export const WeaponsCbManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    itemSourceParent: null as TransformNode | null,

    bowMaterial: null as PBRCustomMaterial | null,
    longSwordMaterial: null as PBRCustomMaterial | null,
    broadSwordMaterial: null as PBRCustomMaterial | null,
    pickAxeMaterial: null as PBRCustomMaterial | null,
    greatAxeMaterial: null as PBRCustomMaterial | null,

    async initMelee(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobWeaponSources", scene)

        // Load materials
        this.bowMaterial = this.getMaterial("hunterbow", matBowSize)
        this.longSwordMaterial = this.getMaterial("longsword", matLongswordSize)
        this.broadSwordMaterial = this.getMaterial("broadsword", matBroadswordSize)
        this.pickAxeMaterial = this.getMaterial("pickaxe", matPickaxeSize)
        this.greatAxeMaterial = this.getMaterial("greataxe", matGreatAxeSize)

        map.set(WeaponModelsCb.LONGSWORD.id, await this.getItem(WeaponModelsCb.LONGSWORD, this.longSwordMaterial))
        map.set(WeaponModelsCb.BROADSWORD.id, await this.getItem(WeaponModelsCb.BROADSWORD, this.broadSwordMaterial))
        map.set(WeaponModelsCb.HUNTERBOW.id, await this.getItem(WeaponModelsCb.HUNTERBOW, this.bowMaterial))
        map.set(WeaponModelsCb.PICKAXE.id, await this.getItem(WeaponModelsCb.PICKAXE, this.pickAxeMaterial))
        map.set(WeaponModelsCb.GREATAXE.id, await this.getItem(WeaponModelsCb.GREATAXE, this.greatAxeMaterial))
    },

    async getItem(data: EquipCbItem, material: PBRCustomMaterial | null = null): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        await item.initializeMeshWeapon(this.itemSourceParent!, Renderer.scene, this.BASE_WEAPONS_PATH + data.model + ".glb", material, data.pos, data.rot, data.scale)
        return item
    },

    getMaterial(texture: string, matSize: Vector2, invertV: boolean = true) {
        const mat = Materials.getPBRCustomMaterialFrom(Renderer.scene!, texture, BASE_EQUIP_MATERIAL_PATH + "weapons/", texture + ".png", 1 / matSize.x, 1 / matSize.y, false, {
            metallic: 0.25,
            roughness: 1,
            directIntensity: 1.5,
            environmentIntensity: 1,
        })
        if (invertV) mat.albedoTexture.vScale = - mat.albedoTexture.vScale
        return mat
    },
}

export const WeaponModelsCb = {
    LONGSWORD: new EquipCbItem(EquipSlotModelsCb.LONGSWORD.modelId, "longsword", Vector3.Zero(), new Vector3(0.2, 0.24, 0.4), new Vector3(0, 2.4, 0), matLongswordSize),

    BROADSWORD: new EquipCbItem(EquipSlotModelsCb.BROADSWORD.modelId, "broadsword", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2, 0), matBroadswordSize),

    PICKAXE: new EquipCbItem(EquipSlotModelsCb.PICKAXE.modelId, "pickaxe", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2, 0), matPickaxeSize),

    GREATAXE: new EquipCbItem(EquipSlotModelsCb.GREATAXE.modelId, "greataxe", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2, 0), matGreatAxeSize),

    HUNTERBOW: new EquipCbItem(EquipSlotModelsCb.HUNTERBOW.modelId, "hunterbow", new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.4), null, matBowSize),
}
