import { Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemType} from '@/babylon/item/equipManager'
import { EquipCbItem} from '@/babylon/item/codebook/equipCbItem'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Renderer } from '@/babylon/scene/renderer'
import { EquipSlotModelsCb } from '@/data/items/item'
import { createVertexColorWeaponMaterial } from '@/babylon/item/codebook/vertexColorPalettes/vertexColorWeaponMaterial'
import { MetalArmorVertexColorPalette } from '@/babylon/item/codebook/vertexColorPalettes/armor'

export const BASE_EQUIP_MATERIAL_PATH = "/models/equip/"

// Armor materialId is a 1-based tile position in this atlas; EquipItem converts it to materialId - 1.
const matMetalSize = new Vector2(16, 8)

// Change when a vertex-colour armour GLB is replaced to avoid mixing it with its palette.
export const ARMOR_MODEL_CACHE_VERSION = '20260925-armor-vertex-legs'

export const ArmorsCbManager = {
    metalArmorVertexColorMaterial: null as PBRCustomMaterial,
    itemSourceParent: null as TransformNode | null,

    async initArmors(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobArmorSources", scene)

        // Load materials
        this.metalArmorVertexColorMaterial = createVertexColorWeaponMaterial('metalArmorVertexColor', scene, MetalArmorVertexColorPalette)
        // Keep back-face rendering for the voxel mesh, but do not flip its
        // normals from gl_FrontFacing. The left-hand bone uses a mirrored
        // transform, which otherwise makes the PBR two-sided branch light the
        // visible shield face as though it faced away from the player light.
        this.metalArmorVertexColorMaterial.twoSidedLighting = false
        // Init all armor types
        map.set(ArmorModelsCb.PLATE_ARMOR_MALE.id, await this.getVertexColorItem(ArmorModelsCb.PLATE_ARMOR_MALE, this.metalArmorVertexColorMaterial))

        map.set(ArmorModelsCb.HELM_MALE.id, await this.getVertexColorItem(ArmorModelsCb.HELM_MALE, this.metalArmorVertexColorMaterial))
        map.set(ArmorModelsCb.SHIELD.id, await this.getVertexColorItem(ArmorModelsCb.SHIELD, this.metalArmorVertexColorMaterial))

        map.set(ArmorModelsCb.PAULDRON_MALE.id, await this.getVertexColorItem(ArmorModelsCb.PAULDRON_MALE, this.metalArmorVertexColorMaterial))

        map.set(ArmorModelsCb.LEG_MALE.id, await this.getVertexColorItem(ArmorModelsCb.LEG_MALE, this.metalArmorVertexColorMaterial))
    },

    async getVertexColorItem(data: EquipCbItem, material: PBRCustomMaterial): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        const glbModelName = ArmorVertexColorGlbNames[data.id] ?? data.model
        await item.initializeMeshGlb(
            this.itemSourceParent!,
            Renderer.scene!,
            `armors/${glbModelName}.glb?v=${ARMOR_MODEL_CACHE_VERSION}`,
            material,
            data.pos,
            data.rot,
            data.scale,
            false,
        )
        return item
    }
}

export const ArmorModelsCb = {
    PLATE_ARMOR_MALE: new EquipCbItem(EquipSlotModelsCb.ARMOR_PLATE.modelId, 'male-armor-plate2', new Vector3(0, 0.39, 0.025), new Vector3(0.23, 0.22, 0.21), null, matMetalSize),

    HELM_MALE: new EquipCbItem(EquipSlotModelsCb.HELM.modelId, 'male-helmet', new Vector3(0, 0.25, 0.01), BabylonUtils.getSymVector(0.215), null, matMetalSize),
    SHIELD: new EquipCbItem(EquipSlotModelsCb.SHIELD.modelId, 'shield', new Vector3(0.15, 0, 0.15), new Vector3(0.24, 0.24, 0.2), null, matMetalSize),

    PAULDRON_MALE: new EquipCbItem(EquipSlotModelsCb.PAULDRONS_PLATE.modelId, 'male-pauldron-plate', new Vector3(-0.06, 0, 0), new Vector3(0.26, 0.32, 0.32), null, matMetalSize),

    LEG_MALE: new EquipCbItem(EquipSlotModelsCb.LEGS_PLATE.modelId, 'male-leg-plate', new Vector3(0.02, 0.2, 0.015), new Vector3(0.23, 0.24, 0.2), null, matMetalSize),
}

/** Runtime GLB names when they differ from the legacy model codebook name. */
export const ArmorVertexColorGlbNames: Record<number, string> = {
    [ArmorModelsCb.PLATE_ARMOR_MALE.id]: 'male-armor-plate',
    [ArmorModelsCb.HELM_MALE.id]: 'male-helmet',
    [ArmorModelsCb.PAULDRON_MALE.id]: 'male-pauldron-plate',
    [ArmorModelsCb.LEG_MALE.id]: 'male-leg-plate',
    [ArmorModelsCb.SHIELD.id]: 'shield',
}
