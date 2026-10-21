import { PBRMaterial, Scene, Texture, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemType} from '@/babylon/item/equipManager'
import { EquipCbItem} from '@/babylon/item/codebook/equipCbItem'
import { EquipSlotModelsCb } from '@/data/items/item'
import { Materials } from '@/babylon/materials'

export const BASE_EQUIP_MATERIAL_PATH = "/models/equip/"

// Armor materialId is a 1-based tile position in this atlas; EquipItem converts it to materialId - 1.
const plateArmorMaterialAtlasSize = new Vector2(4, 4)
// Server material IDs are converted to zero-based indices before rendering.
// The generated/exported atlas order is steel, agapyte, astracyte, gold,
// blood stone, dark stone, mythril. getAtlasUvcOffsets counts rows from the
// bottom, hence 12–15 for the visible top row.
// Missing materials deliberately use the top-left steel tile.
const plateArmorMaterialAtlasIndices = new Map<number, number>([
    [0, 12],
    [2, 13],
    [1, 14],
    [3, 15],
    [4, 8],
    [5, 9],
    [7, 10],
])

const TEXTURED_PLATE_ARMOR_CACHE_VERSION = '20261020-material-atlas'
const TEXTURED_PLATE_HELMET_CACHE_VERSION = '20261020-material-atlas-jpg'
const TEXTURED_PLATE_PAULDRON_CACHE_VERSION = '20261020-material-atlas-jpg'
const TEXTURED_SHIELD_CACHE_VERSION = '20261021-material-atlas-jpg'
const TEXTURED_CHAIN_MAIL_CACHE_VERSION = '20261020-material-atlas-jpg'
const TEXTURED_CHAIN_COIF_CACHE_VERSION = '20261020-material-atlas-jpg'
const TEXTURED_CHAIN_PAULDRON_CACHE_VERSION = '20261020-material-atlas-jpg'
const TEXTURED_PLATE_LEG_CACHE_VERSION = '20261020-material-atlas-jpg'
const TEXTURED_CHAIN_LEG_CACHE_VERSION = '20261020-material-atlas-jpg'
const ARMOR_NORMAL_CACHE_VERSION = '20261021-single-tile'

export interface TexturedArmorAsset {
    modelFile: string
    albedoFile: string
    normalFile: string
    metallic: number
    roughness: number
    directIntensity: number
    environmentIntensity: number
}

/** Shared asset metadata for runtime armour and the GM model-render preview. */
export const TEXTURED_ARMOR_ASSETS = new Map<number, TexturedArmorAsset>([
    [EquipSlotModelsCb.ARMOR_PLATE.modelId, { modelFile: `tripo-male-armor-plate.glb?v=${TEXTURED_PLATE_ARMOR_CACHE_VERSION}`, albedoFile: `plate_armor.jpg?v=${TEXTURED_PLATE_ARMOR_CACHE_VERSION}`, normalFile: 'plate_armor_normal.png', metallic: 0.75, roughness: 0.9, directIntensity: 1.5, environmentIntensity: 1.2 }],
    [EquipSlotModelsCb.HELM.modelId, { modelFile: `tripo-helmet-plate.glb?v=${TEXTURED_PLATE_HELMET_CACHE_VERSION}`, albedoFile: `plate_helmet.jpg?v=${TEXTURED_PLATE_HELMET_CACHE_VERSION}`, normalFile: 'plate_helmet_normal.png', metallic: 0.75, roughness: 0.9, directIntensity: 1.5, environmentIntensity: 1.2 }],
    [EquipSlotModelsCb.PAULDRONS_PLATE.modelId, { modelFile: `tripo-pauldron-plate.glb?v=${TEXTURED_PLATE_PAULDRON_CACHE_VERSION}`, albedoFile: `plate_pauldron.jpg?v=${TEXTURED_PLATE_PAULDRON_CACHE_VERSION}`, normalFile: 'plate_pauldron_normal.png', metallic: 0.75, roughness: 0.9, directIntensity: 1.5, environmentIntensity: 1.2 }],
    [EquipSlotModelsCb.LEGS_PLATE.modelId, { modelFile: `tripo-male-leg-plate.glb?v=${TEXTURED_PLATE_LEG_CACHE_VERSION}`, albedoFile: `plate_leg.jpg?v=${TEXTURED_PLATE_LEG_CACHE_VERSION}`, normalFile: 'plate_leg_normal.png', metallic: 0.75, roughness: 0.9, directIntensity: 1.5, environmentIntensity: 1.2 }],
    [EquipSlotModelsCb.SHIELD.modelId, { modelFile: `tripo_shield.glb?v=${TEXTURED_SHIELD_CACHE_VERSION}`, albedoFile: `shield.jpg?v=${TEXTURED_SHIELD_CACHE_VERSION}`, normalFile: 'shield_normal.png', metallic: 0.75, roughness: 0.9, directIntensity: 1.5, environmentIntensity: 1.2 }],
    [EquipSlotModelsCb.CHAIN_MAIL.modelId, { modelFile: `tripo-male-armor-chain.glb?v=${TEXTURED_CHAIN_MAIL_CACHE_VERSION}`, albedoFile: `chain_mail.jpg?v=${TEXTURED_CHAIN_MAIL_CACHE_VERSION}`, normalFile: 'chain_mail_normal.png', metallic: 0.5, roughness: 1, directIntensity: 1.75, environmentIntensity: 1.4 }],
    [EquipSlotModelsCb.CHAIN_COIF.modelId, { modelFile: `tripo-chain-coif.glb?v=${TEXTURED_CHAIN_COIF_CACHE_VERSION}`, albedoFile: `chain_coif.jpg?v=${TEXTURED_CHAIN_COIF_CACHE_VERSION}`, normalFile: 'chain_coif_normal.png', metallic: 0.5, roughness: 1, directIntensity: 1.75, environmentIntensity: 1.4 }],
    [EquipSlotModelsCb.CHAIN_PAULDRONS.modelId, { modelFile: `tripo-pauldron-chain.glb?v=${TEXTURED_CHAIN_PAULDRON_CACHE_VERSION}`, albedoFile: `chain_pauldron.jpg?v=${TEXTURED_CHAIN_PAULDRON_CACHE_VERSION}`, normalFile: 'chain_pauldron_normal.png', metallic: 0.5, roughness: 1, directIntensity: 1.75, environmentIntensity: 1.4 }],
    [EquipSlotModelsCb.CHAIN_GREAVES.modelId, { modelFile: `tripo-male-leg-chain.glb?v=${TEXTURED_CHAIN_LEG_CACHE_VERSION}`, albedoFile: `chain_leg.jpg?v=${TEXTURED_CHAIN_LEG_CACHE_VERSION}`, normalFile: 'chain_legs_normal.png', metallic: 0.4, roughness: 1, directIntensity: 1.75, environmentIntensity: 1.4 }],
])

function createArmorNormalTexture(scene: Scene, fileName: string): Texture {
    const texture = new Texture(
        `${BASE_EQUIP_MATERIAL_PATH}armors/${fileName}?v=${ARMOR_NORMAL_CACHE_VERSION}`,
        scene,
        { invertY: false },
    )
    texture.gammaSpace = false
    texture.wrapU = Texture.WRAP_ADDRESSMODE
    texture.wrapV = Texture.WRAP_ADDRESSMODE
    return texture
}

/** Textured Tripo armour is intentionally excluded from every shadow-generator render list. */
export const TEXTURED_ARMOR_MODEL_IDS = new Set([
    EquipSlotModelsCb.ARMOR_PLATE.modelId,
    EquipSlotModelsCb.HELM.modelId,
    EquipSlotModelsCb.PAULDRONS_PLATE.modelId,
    EquipSlotModelsCb.LEGS_PLATE.modelId,
    EquipSlotModelsCb.SHIELD.modelId,
    EquipSlotModelsCb.CHAIN_MAIL.modelId,
    EquipSlotModelsCb.CHAIN_COIF.modelId,
    EquipSlotModelsCb.CHAIN_PAULDRONS.modelId,
    EquipSlotModelsCb.CHAIN_GREAVES.modelId,
])

export const ArmorsCbManager = {
    itemSourceParent: null as TransformNode | null,

    async initArmors(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobArmorSources", scene)

        const texturedPlateMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedPlateArmor',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `plate_armor.jpg?v=${TEXTURED_PLATE_ARMOR_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.75,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        // The generated mesh contains visible faces with inconsistent winding.
        // Render both sides, but keep its authored normals for stable lighting.
        texturedPlateMaterial.backFaceCulling = false
        texturedPlateMaterial.twoSidedLighting = false
        texturedPlateMaterial.usePhysicalLightFalloff = false
        texturedPlateMaterial.bumpTexture = createArmorNormalTexture(scene, 'plate_armor_normal.png')
        map.set(
            ArmorModelsCb.PLATE_ARMOR_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.PLATE_ARMOR_MALE,
                texturedPlateMaterial,
                `tripo-male-armor-plate.glb?v=${TEXTURED_PLATE_ARMOR_CACHE_VERSION}`,
            ),
        )

        const texturedPlateHelmetMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedPlateHelmet',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `plate_helmet.jpg?v=${TEXTURED_PLATE_HELMET_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.75,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        texturedPlateHelmetMaterial.backFaceCulling = false
        texturedPlateHelmetMaterial.twoSidedLighting = false
        texturedPlateHelmetMaterial.usePhysicalLightFalloff = false
        texturedPlateHelmetMaterial.bumpTexture = createArmorNormalTexture(scene, 'plate_helmet_normal.png')
        map.set(
            ArmorModelsCb.HELM_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.HELM_MALE,
                texturedPlateHelmetMaterial,
                `tripo-helmet-plate.glb?v=${TEXTURED_PLATE_HELMET_CACHE_VERSION}`,
            ),
        )

        const texturedShieldMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedShield',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `shield.jpg?v=${TEXTURED_SHIELD_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.75,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        texturedShieldMaterial.backFaceCulling = false
        texturedShieldMaterial.twoSidedLighting = false
        texturedShieldMaterial.usePhysicalLightFalloff = false
        texturedShieldMaterial.bumpTexture = createArmorNormalTexture(scene, 'shield_normal.png')
        map.set(
            ArmorModelsCb.SHIELD.id,
            await this.getTexturedArmor(
                ArmorModelsCb.SHIELD,
                texturedShieldMaterial,
                `tripo_shield.glb?v=${TEXTURED_SHIELD_CACHE_VERSION}`,
            ),
        )

        const texturedPlatePauldronMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedPlatePauldron',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `plate_pauldron.jpg?v=${TEXTURED_PLATE_PAULDRON_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.75,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        // The right pauldron is a mirrored thin instance of this single-side mesh.
        texturedPlatePauldronMaterial.backFaceCulling = false
        texturedPlatePauldronMaterial.twoSidedLighting = false
        texturedPlatePauldronMaterial.usePhysicalLightFalloff = false
        texturedPlatePauldronMaterial.bumpTexture = createArmorNormalTexture(scene, 'plate_pauldron_normal.png')
        map.set(
            ArmorModelsCb.PAULDRON_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.PAULDRON_MALE,
                texturedPlatePauldronMaterial,
                `tripo-pauldron-plate.glb?v=${TEXTURED_PLATE_PAULDRON_CACHE_VERSION}`,
            ),
        )

        const texturedChainMailMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedChainMail',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `chain_mail.jpg?v=${TEXTURED_CHAIN_MAIL_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.5,
                roughness: 1,
                directIntensity: 1.75,
                environmentIntensity: 1.4,
            },
            false,
        )
        texturedChainMailMaterial.backFaceCulling = false
        texturedChainMailMaterial.twoSidedLighting = false
        texturedChainMailMaterial.usePhysicalLightFalloff = false
        texturedChainMailMaterial.bumpTexture = createArmorNormalTexture(scene, 'chain_mail_normal.png')
        map.set(
            ArmorModelsCb.CHAIN_MAIL_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.CHAIN_MAIL_MALE,
                texturedChainMailMaterial,
                `tripo-male-armor-chain.glb?v=${TEXTURED_CHAIN_MAIL_CACHE_VERSION}`,
            ),
        )

        const texturedChainCoifMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedChainCoif',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `chain_coif.jpg?v=${TEXTURED_CHAIN_COIF_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.5,
                roughness: 1,
                directIntensity: 1.75,
                environmentIntensity: 1.4,
            },
            false,
        )
        texturedChainCoifMaterial.backFaceCulling = false
        texturedChainCoifMaterial.twoSidedLighting = false
        texturedChainCoifMaterial.usePhysicalLightFalloff = false
        texturedChainCoifMaterial.bumpTexture = createArmorNormalTexture(scene, 'chain_coif_normal.png')
        map.set(
            ArmorModelsCb.CHAIN_COIF_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.CHAIN_COIF_MALE,
                texturedChainCoifMaterial,
                `tripo-chain-coif.glb?v=${TEXTURED_CHAIN_COIF_CACHE_VERSION}`,
            ),
        )

        const texturedChainPauldronMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedChainPauldron',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `chain_pauldron.jpg?v=${TEXTURED_CHAIN_PAULDRON_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.5,
                roughness: 1,
                directIntensity: 1.75,
                environmentIntensity: 1.4,
            },
            false,
        )
        texturedChainPauldronMaterial.backFaceCulling = false
        texturedChainPauldronMaterial.twoSidedLighting = false
        texturedChainPauldronMaterial.usePhysicalLightFalloff = false
        texturedChainPauldronMaterial.bumpTexture = createArmorNormalTexture(scene, 'chain_pauldron_normal.png')
        map.set(
            ArmorModelsCb.CHAIN_PAULDRONS_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.CHAIN_PAULDRONS_MALE,
                texturedChainPauldronMaterial,
                `tripo-pauldron-chain.glb?v=${TEXTURED_CHAIN_PAULDRON_CACHE_VERSION}`,
            ),
        )

        const texturedPlateLegMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedPlateLeg',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `plate_leg.jpg?v=${TEXTURED_PLATE_LEG_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.75,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        // The right leg is a mirrored thin instance of this single-leg mesh.
        texturedPlateLegMaterial.backFaceCulling = false
        texturedPlateLegMaterial.twoSidedLighting = false
        texturedPlateLegMaterial.usePhysicalLightFalloff = false
        texturedPlateLegMaterial.bumpTexture = createArmorNormalTexture(scene, 'plate_leg_normal.png')
        map.set(
            ArmorModelsCb.LEG_MALE.id,
            await this.getTexturedArmor(
                ArmorModelsCb.LEG_MALE,
                texturedPlateLegMaterial,
                `tripo-male-leg-plate.glb?v=${TEXTURED_PLATE_LEG_CACHE_VERSION}`,
            ),
        )

        const texturedChainLegMaterial = Materials.getPBRCustomMaterialFrom(
            scene,
            'texturedChainLeg',
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `chain_leg.jpg?v=${TEXTURED_CHAIN_LEG_CACHE_VERSION}`,
            1 / 4,
            1 / 4,
            false,
            {
                metallic: 0.4,
                roughness: 1,
                directIntensity: 1.75,
                environmentIntensity: 1.4,
            },
            false,
        )
        texturedChainLegMaterial.backFaceCulling = false
        texturedChainLegMaterial.twoSidedLighting = false
        texturedChainLegMaterial.usePhysicalLightFalloff = false
        texturedChainLegMaterial.bumpTexture = createArmorNormalTexture(scene, 'chain_legs_normal.png')
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
    }
}

export const ArmorModelsCb = {
    PLATE_ARMOR_MALE: new EquipCbItem(EquipSlotModelsCb.ARMOR_PLATE.modelId, 'male-armor-plate2', new Vector3(0, 0.39, 0.01), new Vector3(0.23, 0.22, 0.24), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),

    HELM_MALE: new EquipCbItem(EquipSlotModelsCb.HELM.modelId, 'male-helmet', new Vector3(0, 0.25, 0.01), BabylonUtils.getSymVector(0.215), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),
    SHIELD: new EquipCbItem(EquipSlotModelsCb.SHIELD.modelId, 'shield', new Vector3(0.15, 0, 0.15), new Vector3(0.22, 0.22, 0.2), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),

    PAULDRON_MALE: new EquipCbItem(EquipSlotModelsCb.PAULDRONS_PLATE.modelId, 'male-pauldron-plate', new Vector3(-0.06, 0, 0), new Vector3(0.26, 0.32, 0.36), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),

    LEG_MALE: new EquipCbItem(EquipSlotModelsCb.LEGS_PLATE.modelId, 'male-leg-plate', new Vector3(0.02, 0.2, 0.015), new Vector3(0.23, 0.24, 0.2), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),

    CHAIN_MAIL_MALE: new EquipCbItem(EquipSlotModelsCb.CHAIN_MAIL.modelId, 'male-armor-chain', new Vector3(0, 0.39, 0.01), new Vector3(0.23, 0.22, 0.24), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),

    CHAIN_COIF_MALE: new EquipCbItem(EquipSlotModelsCb.CHAIN_COIF.modelId, 'male-coif', new Vector3(0, 0.25, -0.02), BabylonUtils.getSymVector(0.2), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),

    CHAIN_PAULDRONS_MALE: new EquipCbItem(EquipSlotModelsCb.CHAIN_PAULDRONS.modelId, 'male-pauldron-chain', new Vector3(-0.06, 0, 0), new Vector3(0.26, 0.32, 0.36), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),

    CHAIN_GREAVES_MALE: new EquipCbItem(EquipSlotModelsCb.CHAIN_GREAVES.modelId, 'male-leg-chain', new Vector3(0.02, 0.2, 0.015), new Vector3(0.23, 0.24, 0.2), null, plateArmorMaterialAtlasSize, plateArmorMaterialAtlasIndices, 12),
}
