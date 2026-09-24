import { Materials } from '@/babylon/materials'
import { Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemType} from '@/babylon/item/equipManager'
import { EquipCbItem} from '@/babylon/item/codebook/equipCbItem'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Renderer } from '@/babylon/scene/renderer'
import { EquipSlotModelsCb } from '@/data/items/item'
import { createVertexColorWeaponMaterial } from '@/babylon/item/codebook/vertexColorPalettes/vertexColorWeaponMaterial'
import { ShieldVertexColorPalette } from '@/babylon/item/codebook/vertexColorPalettes/armor'

export const BASE_EQUIP_MATERIAL_PATH = "/models/equip/"
export const ARMOR_MATERIAL_METALIC = 'materials-metalic'

// Armor materialId is a 1-based tile position in this atlas; EquipItem converts it to materialId - 1.
const matMetalSize = new Vector2(16, 8)

// Change when shield.glb is replaced to avoid mixing a cached model with its palette.
export const ARMOR_MODEL_CACHE_VERSION = '20260924-shield-vertex'

export const ArmorsCbManager = {
    matMetal: null as PBRCustomMaterial,
    shieldVertexColorMaterial: null as PBRCustomMaterial,
    itemSourceParent: null as TransformNode | null,

    async initArmors(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobArmorSources", scene)

        // Load materials
        this.matMetal = this.getMaterial(ARMOR_MATERIAL_METALIC, matMetalSize)
        this.shieldVertexColorMaterial = createVertexColorWeaponMaterial('shieldVertexColor', scene, ShieldVertexColorPalette)
        this.shieldVertexColorMaterial.metallic = 0.7
        // Keep back-face rendering for the voxel mesh, but do not flip its
        // normals from gl_FrontFacing. The left-hand bone uses a mirrored
        // transform, which otherwise makes the PBR two-sided branch light the
        // visible shield face as though it faced away from the player light.
        this.shieldVertexColorMaterial.twoSidedLighting = false
        // Init all armor types
        map.set(ArmorModelsCb.PLATE_ARMOR_MALE.id, await this.getItem(ArmorModelsCb.PLATE_ARMOR_MALE, this.matMetal))

        map.set(ArmorModelsCb.HELM_MALE.id, await this.getItem(ArmorModelsCb.HELM_MALE, this.matMetal))
        map.set(ArmorModelsCb.HELM_MALE_CLOSED.id, await this.getItem(ArmorModelsCb.HELM_MALE_CLOSED, this.matMetal))
        map.set(ArmorModelsCb.SHIELD.id, await this.getShieldItem())

        map.set(ArmorModelsCb.PAULDRON_MALE.id, await this.getItem(ArmorModelsCb.PAULDRON_MALE, this.matMetal))

        map.set(ArmorModelsCb.LEG_MALE.id, await this.getItem(ArmorModelsCb.LEG_MALE, this.matMetal))
    },

    async getItem(data: EquipCbItem, material: PBRCustomMaterial): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        await item.initializeMeshArmor(this.itemSourceParent!, Renderer.scene!, "armors/" + data.model + ".babylon", material, data.pos, data.rot, data.scale)
        return item
    },

    async getShieldItem(): Promise<EquipItemType> {
        const item = new EquipItemType(ArmorModelsCb.SHIELD)
        try {
            await item.initializeMeshGlb(
                this.itemSourceParent!,
                Renderer.scene!,
                `armors/${ArmorModelsCb.SHIELD.model}.glb?v=${ARMOR_MODEL_CACHE_VERSION}`,
                this.shieldVertexColorMaterial,
                ArmorModelsCb.SHIELD.pos,
                ArmorModelsCb.SHIELD.rot,
                ArmorModelsCb.SHIELD.scale,
                // Older armour meshes do not cast into the personal light.
                // Avoid a broad shield self-shadowing under that close light.
                false,
            )
            return item
        } catch (error) {
            console.info('Shield GLB is unavailable; using the current Babylon fallback.', error)
            return this.getItem(ArmorModelsCb.SHIELD, this.matMetal)
        }
    },

    getMaterial(texture: string, matSize: Vector2) {
        const mat = Materials.getPBRCustomMaterialFrom(Renderer.scene!, texture, BASE_EQUIP_MATERIAL_PATH + "armors/", texture + ".png", 1 / (matSize.x), 1 / (matSize.y), false, {
            metallic: 1.0,
            roughness: 0.75,
            directIntensity: 1.5,
            environmentIntensity: 1,
        })
        return mat
    }
}

export const ArmorModelsCb = {
    PLATE_ARMOR_MALE: new EquipCbItem(EquipSlotModelsCb.ARMOR_PLATE.modelId, 'male-armor-plate2', new Vector3(-0.01, 0.62, 0.02), new Vector3(0.4, 0.4, 0.37), null, matMetalSize),

    HELM_MALE: new EquipCbItem(EquipSlotModelsCb.HELM.modelId, 'male-helmet', new Vector3(0, 0.4, 0), BabylonUtils.getSymVector(0.39), null, matMetalSize),
    HELM_MALE_CLOSED: new EquipCbItem(EquipSlotModelsCb.HELM_CLOSED.modelId, 'male-helmet_closed', new Vector3(0, 0.42, 0), BabylonUtils.getSymVector(0.45), null, matMetalSize),
    SHIELD: new EquipCbItem(EquipSlotModelsCb.SHIELD.modelId, 'shield', new Vector3(0.15, 0, 0.2), new Vector3(0.23, 0.23, 0.23), null, matMetalSize),

    PAULDRON_MALE: new EquipCbItem(EquipSlotModelsCb.PAULDRONS_PLATE.modelId, 'male-pauldron-plate', new Vector3(0.06, -0.15, 0), new Vector3(0.5, 0.5, 0.5), null, matMetalSize),

    LEG_MALE: new EquipCbItem(EquipSlotModelsCb.LEGS_PLATE.modelId, 'male-leg-plate', new Vector3(-0.005, -0.1, 0.015), new Vector3(0.23, 0.24, 0.2), null, matMetalSize),
}
