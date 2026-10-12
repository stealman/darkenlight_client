import { PBRMaterial, Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemType} from '@/babylon/item/equipManager'
import { EquipCbItem} from '@/babylon/item/codebook/equipCbItem'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { EquipSlotModelsCb } from '@/data/items/item'
import { createVertexColorWeaponMaterial } from '@/babylon/item/codebook/vertexColorPalettes/vertexColorWeaponMaterial'
import { MetalArmorVertexColorPalette, ShieldDetailVertexColorPalette } from '@/babylon/item/codebook/vertexColorPalettes/armor'
import { Materials } from '@/babylon/materials'

export const BASE_EQUIP_MATERIAL_PATH = "/models/equip/"

// Armor materialId is a 1-based tile position in this atlas; EquipItem converts it to materialId - 1.
const matMetalSize = new Vector2(16, 8)

// Change when a vertex-colour armour GLB is replaced to avoid mixing it with its palette.
export const ARMOR_MODEL_CACHE_VERSION = '20260925-armor-details-renamed'
const TEXTURED_PLATE_ARMOR_CACHE_VERSION = '20261011-initial-test'
const TEXTURED_CHAIN_MAIL_CACHE_VERSION = '20261012-initial-test'
const TEXTURED_PLATE_LEG_CACHE_VERSION = '20261012-initial-test'
const TEXTURED_CHAIN_LEG_CACHE_VERSION = '20261012-initial-test'
const TEXTURED_ARMOR_MODEL_IDS = new Set([
    EquipSlotModelsCb.ARMOR_PLATE.modelId,
    EquipSlotModelsCb.LEGS_PLATE.modelId,
    EquipSlotModelsCb.CHAIN_MAIL.modelId,
    EquipSlotModelsCb.CHAIN_GREAVES.modelId,
])

export const ArmorsCbManager = {
    metalArmorVertexColorMaterial: null as PBRCustomMaterial,
    detailArmorVertexColorMaterial: null as PBRCustomMaterial,
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
        this.detailArmorVertexColorMaterial = createVertexColorWeaponMaterial('detailArmorVertexColor', scene, ShieldDetailVertexColorPalette)
        this.detailArmorVertexColorMaterial.twoSidedLighting = false
        // Init all armor types
        for (const armorModel of Object.values(ArmorModelsCb)) {
            if (TEXTURED_ARMOR_MODEL_IDS.has(armorModel.id)) continue
            map.set(armorModel.id, await this.getVertexColorItem(armorModel, this.getVertexColorMaterial(armorModel)))
        }

        const texturedPlateMaterial = Materials.getPBRMaterial(
            scene,
            'texturedPlateArmor',
            `${BASE_EQUIP_MATERIAL_PATH}armors/plate_armor.png`,
            false,
            false,
            {
                metallic: 0.75,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
        )
        // The generated mesh contains visible faces with inconsistent winding.
        // Render both sides, but keep its authored normals for stable lighting.
        texturedPlateMaterial.backFaceCulling = false
        texturedPlateMaterial.twoSidedLighting = false
        texturedPlateMaterial.usePhysicalLightFalloff = false
        map.set(
            ArmorModelsCb.PLATE_ARMOR_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.PLATE_ARMOR_MALE,
                texturedPlateMaterial,
                `tripo-male-armor-plate.glb?v=${TEXTURED_PLATE_ARMOR_CACHE_VERSION}`,
            ),
        )

        const texturedChainMailMaterial = Materials.getPBRMaterial(
            scene,
            'texturedChainMail',
            `${BASE_EQUIP_MATERIAL_PATH}armors/chain_mail.png`,
            false,
            false,
            {
                metallic: 0.5,
                roughness: 1,
                directIntensity: 1.75,
                environmentIntensity: 1.4,
            },
        )
        texturedChainMailMaterial.backFaceCulling = false
        texturedChainMailMaterial.twoSidedLighting = false
        texturedChainMailMaterial.usePhysicalLightFalloff = false
        map.set(
            ArmorModelsCb.CHAIN_MAIL_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.CHAIN_MAIL_MALE,
                texturedChainMailMaterial,
                `tripo-male-armor-chain.glb?v=${TEXTURED_CHAIN_MAIL_CACHE_VERSION}`,
            ),
        )

        const texturedPlateLegMaterial = Materials.getPBRMaterial(
            scene,
            'texturedPlateLeg',
            `${BASE_EQUIP_MATERIAL_PATH}armors/plate_leg.png`,
            false,
            false,
            {
                metallic: 0.6,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
        )
        // The right leg is a mirrored thin instance of this single-leg mesh.
        texturedPlateLegMaterial.backFaceCulling = false
        texturedPlateLegMaterial.twoSidedLighting = false
        texturedPlateLegMaterial.usePhysicalLightFalloff = false
        map.set(
            ArmorModelsCb.LEG_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.LEG_MALE,
                texturedPlateLegMaterial,
                `tripo-male-leg-plate.glb?v=${TEXTURED_PLATE_LEG_CACHE_VERSION}`,
            ),
        )

        const texturedChainLegMaterial = Materials.getPBRMaterial(
            scene,
            'texturedChainLeg',
            `${BASE_EQUIP_MATERIAL_PATH}armors/chain_leg.png`,
            false,
            false,
            {
                metallic: 0.4,
                roughness: 1,
                directIntensity: 1.75,
                environmentIntensity: 1.4,
            },
        )
        texturedChainLegMaterial.backFaceCulling = false
        texturedChainLegMaterial.twoSidedLighting = false
        texturedChainLegMaterial.usePhysicalLightFalloff = false
        map.set(
            ArmorModelsCb.CHAIN_GREAVES_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.CHAIN_GREAVES_MALE,
                texturedChainLegMaterial,
                `tripo-male-leg-chain.glb?v=${TEXTURED_CHAIN_LEG_CACHE_VERSION}`,
            ),
        )
    },

    async getTexturedArmor(data: EquipCbItem, material: PBRMaterial, fileName: string): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        await item.initializeMeshGlb(
            this.itemSourceParent!,
            this.itemSourceParent!.getScene(),
            `armors/${fileName}`,
            material,
            data.pos,
            data.rot,
            data.scale,
            false,
        )
        return item
    },

    getVertexColorMaterial(data: EquipCbItem): PBRCustomMaterial {
        return ArmorModelsWithDetailPalette.has(data.id)
            ? this.detailArmorVertexColorMaterial
            : this.metalArmorVertexColorMaterial
    },

    async getVertexColorItem(data: EquipCbItem, material: PBRCustomMaterial): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        const glbModelName = ArmorVertexColorGlbNames[data.id] ?? data.model
        const castsShadows = data.id === EquipSlotModelsCb.SHIELD.modelId
        try {
            await item.initializeMeshGlb(
                this.itemSourceParent!,
                this.itemSourceParent!.getScene(),
                `armors/${glbModelName}.glb?v=${ARMOR_MODEL_CACHE_VERSION}`,
                material,
                data.pos,
                data.rot,
                data.scale,
                castsShadows,
            )
        } catch (error) {
            const fallbackGlbName = ArmorVertexColorFallbackGlbNames[data.id]
            if (!fallbackGlbName) {
                throw error
            }
            await item.initializeMeshGlb(
                this.itemSourceParent!,
                this.itemSourceParent!.getScene(),
                `armors/${fallbackGlbName}.glb?v=${ARMOR_MODEL_CACHE_VERSION}`,
                material,
                data.pos,
                data.rot,
                data.scale,
                castsShadows,
            )
        }
        return item
    }
}

export const ArmorModelsCb = {
    PLATE_ARMOR_MALE: new EquipCbItem(EquipSlotModelsCb.ARMOR_PLATE.modelId, 'male-armor-plate2', new Vector3(0, 0.39, 0.01), new Vector3(0.23, 0.22, 0.24), null, matMetalSize),

    HELM_MALE: new EquipCbItem(EquipSlotModelsCb.HELM.modelId, 'male-helmet', new Vector3(0, 0.25, 0.01), BabylonUtils.getSymVector(0.215), null, matMetalSize),
    SHIELD: new EquipCbItem(EquipSlotModelsCb.SHIELD.modelId, 'shield', new Vector3(0.15, 0, 0.15), new Vector3(0.22, 0.22, 0.2), null, matMetalSize),

    PAULDRON_MALE: new EquipCbItem(EquipSlotModelsCb.PAULDRONS_PLATE.modelId, 'male-pauldron-plate', new Vector3(-0.06, 0, 0), new Vector3(0.26, 0.32, 0.36), null, matMetalSize),

    LEG_MALE: new EquipCbItem(EquipSlotModelsCb.LEGS_PLATE.modelId, 'male-leg-plate', new Vector3(0.02, 0.2, 0.015), new Vector3(0.23, 0.24, 0.2), null, matMetalSize),

    CHAIN_MAIL_MALE: new EquipCbItem(EquipSlotModelsCb.CHAIN_MAIL.modelId, 'male-armor-chain', new Vector3(0, 0.39, 0.01), new Vector3(0.23, 0.22, 0.24), null, matMetalSize),

    CHAIN_COIF_MALE: new EquipCbItem(EquipSlotModelsCb.CHAIN_COIF.modelId, 'male-coif', new Vector3(0, 0.25, -0.02), BabylonUtils.getSymVector(0.2), null, matMetalSize),

    CHAIN_PAULDRONS_MALE: new EquipCbItem(EquipSlotModelsCb.CHAIN_PAULDRONS.modelId, 'male-pauldron-chain', new Vector3(-0.06, 0, 0), new Vector3(0.26, 0.32, 0.36), null, matMetalSize),

    CHAIN_GREAVES_MALE: new EquipCbItem(EquipSlotModelsCb.CHAIN_GREAVES.modelId, 'male-leg-chain', new Vector3(0.02, 0.2, 0.015), new Vector3(0.23, 0.24, 0.2), null, matMetalSize),
}

/** Models whose source vertex colours include the secondary-material marker. */
export const ArmorModelsWithDetailPalette = new Set<number>([
    ArmorModelsCb.PLATE_ARMOR_MALE.id,
    ArmorModelsCb.SHIELD.id,
    ArmorModelsCb.PAULDRON_MALE.id,
    ArmorModelsCb.LEG_MALE.id,
    ArmorModelsCb.CHAIN_MAIL_MALE.id,
    ArmorModelsCb.CHAIN_COIF_MALE.id,
    ArmorModelsCb.CHAIN_PAULDRONS_MALE.id,
    ArmorModelsCb.CHAIN_GREAVES_MALE.id,
])

/** Runtime GLB names when they differ from the model codebook name. */
export const ArmorVertexColorGlbNames: Record<number, string> = {
    [ArmorModelsCb.PLATE_ARMOR_MALE.id]: 'male-armor-plate',
    [ArmorModelsCb.HELM_MALE.id]: 'male-helmet',
    [ArmorModelsCb.PAULDRON_MALE.id]: 'male-pauldron-plate',
    [ArmorModelsCb.LEG_MALE.id]: 'male-leg-plate',
    [ArmorModelsCb.SHIELD.id]: 'shield',
    [ArmorModelsCb.CHAIN_MAIL_MALE.id]: 'male-armor-chain',
    [ArmorModelsCb.CHAIN_COIF_MALE.id]: 'male-coif',
    [ArmorModelsCb.CHAIN_PAULDRONS_MALE.id]: 'male-pauldron-chain',
    [ArmorModelsCb.CHAIN_GREAVES_MALE.id]: 'male-leg-chain',
}

/** Temporary visuals used only while the dedicated chain GLBs are unavailable. */
export const ArmorVertexColorFallbackGlbNames: Partial<Record<number, string>> = {
    [ArmorModelsCb.CHAIN_MAIL_MALE.id]: 'male-armor-plate',
    [ArmorModelsCb.CHAIN_COIF_MALE.id]: 'male-helmet',
    [ArmorModelsCb.CHAIN_PAULDRONS_MALE.id]: 'male-pauldron-plate',
    [ArmorModelsCb.CHAIN_GREAVES_MALE.id]: 'male-leg-plate',
}
