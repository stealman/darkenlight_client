import { Scene, Texture, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { EquipItemType } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Materials } from '@/babylon/materials'
import { BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/codebook/armorsModelsCb'
import { EquipSlotModelsCb } from '@/data/items/item'
import { BOW_WEAPON_MATERIAL_NAMES, WAND_MATERIAL_ATLAS_TILES } from './vertexColorPalettes/types'
import { PolearmVertexColorPalettes } from './vertexColorPalettes/polearms'
import { createVertexColorWeaponMaterial } from './vertexColorPalettes/vertexColorWeaponMaterial'

const matTexturedBowSize = new Vector2(4, 4)
const matLongswordSize = new Vector2(4, 4)
const matBroadswordSize = new Vector2(4, 4)
const matGreatswordSize = new Vector2(4, 4)
const matPickaxeSize = new Vector2(4, 4)
const matHandAxeSize = new Vector2(4, 4)
const matBattleAxeSize = new Vector2(4, 4)
const matGreatAxeSize = new Vector2(4, 4)
const matLargeBattleAxeSize = new Vector2(4, 4)
const matWarhammerSize = new Vector2(4, 4)
const matFutureWeaponSize = new Vector2(5, 1)
const matHalberdSize = new Vector2(4, 4)
const matHuntingSpearSize = new Vector2(4, 4)
const matLightMaceSize = new Vector2(4, 4)
const matWarmaceSize = new Vector2(4, 4)

// Change this when a weapon GLB is replaced. The URL revision prevents an
// installed PWA from combining a newly deployed shader with an old HTTP-cached model.
export const WEAPON_MODEL_CACHE_VERSION = '20260930-battlebow-v1'
const LONGSWORD_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const LARGE_BATTLE_AXE_ASSET_CACHE_VERSION = '20261112-material-atlas-v1'
const GREATSWORD_ASSET_CACHE_VERSION = '20261112-material-atlas-v1'
const BROADSWORD_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const GREATAXE_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const GREATAXE_NORMAL_CACHE_VERSION = '20261022-single-tile-v1'
const HALBERD_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const PICKAXE_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const HANDAXE_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const BATTLEAXE_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const HUNTINGSPEAR_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const LIGHTMACE_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'
const WARHAMMER_ASSET_CACHE_VERSION = '20261118-draco-atlas-v3'
const BATTLEBOW_ASSET_CACHE_VERSION = '20261118-material-atlas-v1'
const RECURVEBOW_ASSET_CACHE_VERSION = '20261118-material-atlas-v1'
const HUNTINGBOW_ASSET_CACHE_VERSION = '20261118-material-atlas-v1'
const WARMACE_ASSET_CACHE_VERSION = '20261103-silver-atlas-v1'

const createWeaponMaterialAtlasIndices = (atlasSize: Vector2) => new Map<number, number>(
    // Silver uses materialId 7 (index 6); index 5 remains reserved for Diamond.
    [0, 1, 2, 3, 4, 6].map((materialIndex, atlasTile) => {
        const tileX = atlasTile % atlasSize.x
        const tileY = Math.floor(atlasTile / atlasSize.x)
        return [materialIndex, (atlasSize.y - 1 - tileY) * atlasSize.x + tileX] as [number, number]
    }),
)
const bowMaterialAtlasIndices = new Map<number, number>(
    BOW_WEAPON_MATERIAL_NAMES.map((_, index) => [
        index, (matTexturedBowSize.y - 1 - Math.floor(index / matTexturedBowSize.x)) * matTexturedBowSize.x + index % matTexturedBowSize.x,
    ]),
)
const wandMaterialAtlasIndices = new Map(WAND_MATERIAL_ATLAS_TILES.map((tile, index) => [index, bowMaterialAtlasIndices.get(tile)!]))
const longswordMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matLongswordSize)
const largeBattleAxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matLargeBattleAxeSize)
const greatswordMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matGreatswordSize)
const broadswordMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matBroadswordSize)
const greataxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matGreatAxeSize)
const halberdMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matHalberdSize)
const pickaxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matPickaxeSize)
const handaxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matHandAxeSize)
const battleaxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matBattleAxeSize)
const huntingspearMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matHuntingSpearSize)
const lightmaceMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matLightMaceSize)
const warhammerMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matWarhammerSize)
const warmaceMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matWarmaceSize)

function createWeaponNormalTexture(scene: Scene, fileName: string, cacheVersion: string): Texture {
    const texture = new Texture(
        `${BASE_EQUIP_MATERIAL_PATH}weapons/${fileName}?v=${cacheVersion}`,
        scene,
        { invertY: false },
    )
    texture.gammaSpace = false
    texture.wrapU = Texture.WRAP_ADDRESSMODE
    texture.wrapV = Texture.WRAP_ADDRESSMODE
    return texture
}

export const WeaponsCbManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    sourceParents: new WeakMap<Scene, TransformNode>(),

    registerModels(map: Map<number, EquipItemType>, scene: Scene) {
        const loaders = [
            [WeaponModelsCb.HUNTINGBOW, this.initHuntingBow],
            [WeaponModelsCb.RECURVE_BOW, this.initRecurveBow],
            [WeaponModelsCb.BATTLEBOW, this.initBattleBow],
            [WeaponModelsCb.CRYSTALWAND, this.initCrystalWand],
            [WeaponModelsCb.LONGSWORD, this.initLongsword],
            [WeaponModelsCb.BROADSWORD, this.initBroadsword],
            [WeaponModelsCb.GREATSWORD, this.initGreatsword],
            [WeaponModelsCb.LARGE_BATTLE_AXE, this.initLargeBattleAxe],
            [WeaponModelsCb.GREATAXE, this.initGreatAxe],
            [WeaponModelsCb.HALBERD, this.initHalberd],
            [WeaponModelsCb.PICKAXE, this.initPickaxe],
            [WeaponModelsCb.HAND_AXE, this.initHandAxe],
            [WeaponModelsCb.BATTLE_AXE, this.initBattleAxe],
            [WeaponModelsCb.HUNTING_SPEAR, this.initHuntingSpear],
            [WeaponModelsCb.LIGHT_MACE, this.initLightMace],
            [WeaponModelsCb.WARMACE, this.initWarmace],
            [WeaponModelsCb.WARHAMMER, this.initWarhammer],
        ] as const
        for (const [data, load] of loaders) {
            map.set(data.id, new EquipItemType(data, () => load.call(this, map, scene)))
        }
        return loaders
    },

    async initMelee(map: Map<number, EquipItemType>, scene: Scene) {
        for (const [, load] of this.registerModels(map, scene)) await load.call(this, map, scene)
    },

    async initHuntingBow(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'huntingBowMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `huntingbow.jpg?v=${HUNTINGBOW_ASSET_CACHE_VERSION}`,
            1 / matTexturedBowSize.x,
            1 / matTexturedBowSize.y,
            false,
            { metallic: 0.25, roughness: 1, directIntensity: 1.5, environmentIntensity: 1 },
            false,
        )
        map.set(WeaponModelsCb.HUNTINGBOW.id, await this.getItem(
            map, scene,
            WeaponModelsCb.HUNTINGBOW,
            material,
            `huntingbow.glb?v=${HUNTINGBOW_ASSET_CACHE_VERSION}`,
        ))
    },

    async initRecurveBow(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'recurveBowMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `recurvebow.jpg?v=${RECURVEBOW_ASSET_CACHE_VERSION}`,
            1 / matTexturedBowSize.x,
            1 / matTexturedBowSize.y,
            false,
            { metallic: 0.25, roughness: 1, directIntensity: 1.5, environmentIntensity: 1 },
            false,
        )
        map.set(WeaponModelsCb.RECURVE_BOW.id, await this.getItem(
            map, scene,
            WeaponModelsCb.RECURVE_BOW,
            material,
            `recurvebow.glb?v=${RECURVEBOW_ASSET_CACHE_VERSION}`,
        ))
    },

    async initBattleBow(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'battleBowMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `battlebow.jpg?v=${BATTLEBOW_ASSET_CACHE_VERSION}`,
            1 / matTexturedBowSize.x,
            1 / matTexturedBowSize.y,
            false,
            { metallic: 0.25, roughness: 1, directIntensity: 1.5, environmentIntensity: 1 },
            false,
        )
        map.set(WeaponModelsCb.BATTLEBOW.id, await this.getItem(
            map, scene,
            WeaponModelsCb.BATTLEBOW,
            material,
            `battlebow.glb?v=${BATTLEBOW_ASSET_CACHE_VERSION}`,
        ))
    },

    async initCrystalWand(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'crystalWandMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            'crystalwand.jpg',
            1 / matTexturedBowSize.x,
            1 / matTexturedBowSize.y,
            false,
            { metallic: 0.25, roughness: 1, directIntensity: 1.5, environmentIntensity: 1 },
            false,
        )
        map.set(WeaponModelsCb.CRYSTALWAND.id, await this.getItem(map, scene, WeaponModelsCb.CRYSTALWAND, material))
    },

    async initLongsword(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'longswordMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `longsword.jpg?v=${LONGSWORD_ASSET_CACHE_VERSION}`,
            1 / matLongswordSize.x,
            1 / matLongswordSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.LONGSWORD.id, await this.getItem(
            map, scene,
            WeaponModelsCb.LONGSWORD,
            material,
            `longsword.glb?v=${LONGSWORD_ASSET_CACHE_VERSION}`,
        ))
    },

    async initBroadsword(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'broadswordMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `broadsword.jpg?v=${BROADSWORD_ASSET_CACHE_VERSION}`,
            1 / matBroadswordSize.x,
            1 / matBroadswordSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.BROADSWORD.id, await this.getItem(
            map, scene,
            WeaponModelsCb.BROADSWORD,
            material,
            `broadsword.glb?v=${BROADSWORD_ASSET_CACHE_VERSION}`,
        ))
    },

    async initGreatsword(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'greatswordMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `greatsword.jpg?v=${GREATSWORD_ASSET_CACHE_VERSION}`,
            1 / matGreatswordSize.x,
            1 / matGreatswordSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.GREATSWORD.id, await this.getItem(
            map, scene,
            WeaponModelsCb.GREATSWORD,
            material,
            `greatsword.glb?v=${GREATSWORD_ASSET_CACHE_VERSION}`,
        ))
    },

    async initLargeBattleAxe(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'largeBattleAxeMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `large_battleaxe.jpg?v=${LARGE_BATTLE_AXE_ASSET_CACHE_VERSION}`,
            1 / matLargeBattleAxeSize.x,
            1 / matLargeBattleAxeSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.LARGE_BATTLE_AXE.id, await this.getItem(
            map, scene,
            WeaponModelsCb.LARGE_BATTLE_AXE,
            material,
            `large-battleaxe.glb?v=${LARGE_BATTLE_AXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initGreatAxe(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'greataxeMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `greataxe.jpg?v=${GREATAXE_ASSET_CACHE_VERSION}`,
            1 / matGreatAxeSize.x,
            1 / matGreatAxeSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        material.bumpTexture = createWeaponNormalTexture(scene, 'greataxe_normal.png', GREATAXE_NORMAL_CACHE_VERSION)
        map.set(WeaponModelsCb.GREATAXE.id, await this.getItem(
            map, scene,
            WeaponModelsCb.GREATAXE,
            material,
            `greataxe.glb?v=${GREATAXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initHalberd(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'halberdMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `halberd.jpg?v=${HALBERD_ASSET_CACHE_VERSION}`,
            1 / matHalberdSize.x,
            1 / matHalberdSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.HALBERD.id, await this.getItem(
            map, scene,
            WeaponModelsCb.HALBERD,
            material,
            `halberd.glb?v=${HALBERD_ASSET_CACHE_VERSION}`,
        ))
    },

    async initPickaxe(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'pickaxeMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `pickaxe.jpg?v=${PICKAXE_ASSET_CACHE_VERSION}`,
            1 / matPickaxeSize.x,
            1 / matPickaxeSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.PICKAXE.id, await this.getItem(
            map, scene,
            WeaponModelsCb.PICKAXE,
            material,
            `pickaxe.glb?v=${PICKAXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initHandAxe(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'handaxeMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `handaxe.jpg?v=${HANDAXE_ASSET_CACHE_VERSION}`,
            1 / matHandAxeSize.x,
            1 / matHandAxeSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.HAND_AXE.id, await this.getItem(
            map, scene,
            WeaponModelsCb.HAND_AXE,
            material,
            `handaxe.glb?v=${HANDAXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initBattleAxe(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'battleaxeMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `battleaxe.jpg?v=${BATTLEAXE_ASSET_CACHE_VERSION}`,
            1 / matBattleAxeSize.x,
            1 / matBattleAxeSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.BATTLE_AXE.id, await this.getItem(
            map, scene,
            WeaponModelsCb.BATTLE_AXE,
            material,
            `battleaxe.glb?v=${BATTLEAXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initHuntingSpear(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'huntingspearMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `huntingspear.jpg?v=${HUNTINGSPEAR_ASSET_CACHE_VERSION}`,
            1 / matHuntingSpearSize.x,
            1 / matHuntingSpearSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.HUNTING_SPEAR.id, await this.getItem(
            map, scene,
            WeaponModelsCb.HUNTING_SPEAR,
            material,
            `huntingspear.glb?v=${HUNTINGSPEAR_ASSET_CACHE_VERSION}`,
        ))
    },

    async initLightMace(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'lightmaceMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `lightmace.jpg?v=${LIGHTMACE_ASSET_CACHE_VERSION}`,
            1 / matLightMaceSize.x,
            1 / matLightMaceSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.LIGHT_MACE.id, await this.getItem(
            map, scene,
            WeaponModelsCb.LIGHT_MACE,
            material,
            `lightmace.glb?v=${LIGHTMACE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initWarmace(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'warmaceMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `warmace.jpg?v=${WARMACE_ASSET_CACHE_VERSION}`,
            1 / matWarmaceSize.x,
            1 / matWarmaceSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.WARMACE.id, await this.getItem(
            map, scene,
            WeaponModelsCb.WARMACE,
            material,
            `warmace.glb?v=${WARMACE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initWarhammer(map: Map<number, EquipItemType>, scene: Scene) {
        const material = Materials.getPBRCustomMaterialFrom(
            scene,
            'warhammerMaterialAtlas',
            BASE_EQUIP_MATERIAL_PATH + this.BASE_WEAPONS_PATH,
            `warhammer.jpg?v=${WARHAMMER_ASSET_CACHE_VERSION}`,
            1 / matWarhammerSize.x,
            1 / matWarhammerSize.y,
            false,
            {
                metallic: 0.5,
                roughness: 0.9,
                directIntensity: 1.5,
                environmentIntensity: 1.2,
            },
            false,
        )
        material.backFaceCulling = false
        material.twoSidedLighting = false
        material.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.WARHAMMER.id, await this.getItem(
            map, scene,
            WeaponModelsCb.WARHAMMER,
            material,
            `warhammer.glb?v=${WARHAMMER_ASSET_CACHE_VERSION}`,
        ))
    },

    async getItem(map: Map<number, EquipItemType>, scene: Scene, data: EquipCbItem, material: PBRCustomMaterial, fileName = data.model + ".glb?v=" + WEAPON_MODEL_CACHE_VERSION): Promise<EquipItemType> {
        let parent = this.sourceParents.get(scene)
        if (!parent) {
            parent = new TransformNode("mobWeaponSources", scene)
            this.sourceParents.set(scene, parent)
        }
        const item = map.get(data.id) ?? new EquipItemType(data)
        await item.initializeMeshGlb(parent, scene, this.BASE_WEAPONS_PATH + fileName, material, data.pos, data.rot, data.scale)
        return item
    },

}

export const WeaponModelsCb = {
    LONGSWORD: new EquipCbItem(
        EquipSlotModelsCb.LONGSWORD.modelId,
        'longsword',
        Vector3.Zero(),
        new Vector3(0.24, 0.24, 0.25),
        new Vector3(0, 2.4, 0),
        matLongswordSize,
        longswordMaterialAtlasIndices,
        longswordMaterialAtlasIndices.get(0) ?? 12,
    ),

    BROADSWORD: new EquipCbItem(
        EquipSlotModelsCb.BROADSWORD.modelId,
        'broadsword',
        Vector3.Zero(),
        new Vector3(0.22, 0.24, 0.25),
        new Vector3(0, 2, 0),
        matBroadswordSize,
        broadswordMaterialAtlasIndices,
        broadswordMaterialAtlasIndices.get(0) ?? 12,
    ),

    GREATSWORD: new EquipCbItem(
        EquipSlotModelsCb.GREATSWORD.modelId,
        'greatsword',
        new Vector3(0, -0.1, 0),
        new Vector3(0.2, 0.28, 0.18),
        new Vector3(0, 3.2, 0),
        matGreatswordSize,
        greatswordMaterialAtlasIndices,
        greatswordMaterialAtlasIndices.get(0) ?? 12,
    ),

    HAND_AXE: new EquipCbItem(
        EquipSlotModelsCb.HAND_AXE.modelId,
        'handaxe',
        Vector3.Zero(),
        new Vector3(0.25, 0.28, 0.25),
        new Vector3(0, 2, 0),
        matHandAxeSize,
        handaxeMaterialAtlasIndices,
        handaxeMaterialAtlasIndices.get(0) ?? 12,
    ),

    BATTLE_AXE: new EquipCbItem(
        EquipSlotModelsCb.BATTLE_AXE.modelId,
        'battleaxe',
        Vector3.Zero(),
        new Vector3(0.25, 0.28, 0.25),
        new Vector3(0, 2.2, 0),
        matBattleAxeSize,
        battleaxeMaterialAtlasIndices,
        battleaxeMaterialAtlasIndices.get(0) ?? 12,
    ),

    GREATAXE: new EquipCbItem(
        EquipSlotModelsCb.GREATAXE.modelId,
        'greataxe',
        Vector3.Zero(),
        new Vector3(0.25, 0.24, 0.25),
        new Vector3(0, 2.5, 0),
        matGreatAxeSize,
        greataxeMaterialAtlasIndices,
        greataxeMaterialAtlasIndices.get(0) ?? 12,
    ),

    LARGE_BATTLE_AXE: new EquipCbItem(EquipSlotModelsCb.LARGE_BATTLE_AXE.modelId, 'largebattlexe', new Vector3(0, -0.075, 0), new Vector3(0.22, 0.24, 0.24), new Vector3(0, 2.5, 0), matLargeBattleAxeSize, largeBattleAxeMaterialAtlasIndices, largeBattleAxeMaterialAtlasIndices.get(0) ?? 12),

    PICKAXE: new EquipCbItem(
        EquipSlotModelsCb.PICKAXE.modelId,
        'pickaxe',
        Vector3.Zero(),
        new Vector3(0.25, 0.22, 0.3),
        new Vector3(0, 2.2, 0),
        matPickaxeSize,
        pickaxeMaterialAtlasIndices,
        pickaxeMaterialAtlasIndices.get(0) ?? 12,
    ),

    LIGHT_MACE: new EquipCbItem(
        EquipSlotModelsCb.LIGHT_MACE.modelId,
        'lightmace',
        Vector3.Zero(),
        new Vector3(0.28, 0.26, 0.28),
        new Vector3(0, 2, 0),
        matLightMaceSize,
        lightmaceMaterialAtlasIndices,
        lightmaceMaterialAtlasIndices.get(0) ?? 12,
    ),

    WARMACE: new EquipCbItem(
        EquipSlotModelsCb.WARMACE.modelId,
        'warmace',
        Vector3.Zero(),
        new Vector3(0.22, 0.24, 0.22),
        new Vector3(0, 2.2, 0),
        matWarmaceSize,
        warmaceMaterialAtlasIndices,
        warmaceMaterialAtlasIndices.get(0) ?? 12,
    ),

    WARHAMMER: new EquipCbItem(EquipSlotModelsCb.WARHAMMER.modelId, 'warhammer', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2.5, 0), matWarhammerSize, warhammerMaterialAtlasIndices, warhammerMaterialAtlasIndices.get(0) ?? 12),

    HUNTING_SPEAR: new EquipCbItem(
        EquipSlotModelsCb.HUNTING_SPEAR.modelId,
        'huntingspear',
        Vector3.Zero(),
        new Vector3(0.22, 0.24, 0.22),
        new Vector3(0, 2.8, 0),
        matHuntingSpearSize,
        huntingspearMaterialAtlasIndices,
        huntingspearMaterialAtlasIndices.get(0) ?? 12,
    ),


    HALBERD: new EquipCbItem(
        EquipSlotModelsCb.HALBERD.modelId,
        'halberd',
        new Vector3(0, -0.1, 0),
        new Vector3(0.25, 0.28, 0.25),
        new Vector3(-0.2, 3.2, 0),
        matHalberdSize,
        halberdMaterialAtlasIndices,
        halberdMaterialAtlasIndices.get(0) ?? 12,
    ),

    HUNTINGBOW: new EquipCbItem(EquipSlotModelsCb.HUNTINGBOW.modelId, 'huntingbow', new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.2), null, matTexturedBowSize, bowMaterialAtlasIndices, bowMaterialAtlasIndices.get(0) ?? 12),

    CRYSTALWAND: new EquipCbItem(
        EquipSlotModelsCb.CRYSTALWAND.modelId,
        'crystalwand',
        Vector3.Zero(),
        new Vector3(0.27, 0.27, 0.27),
        new Vector3(0.03, 2.37, 0),
        matTexturedBowSize,
        wandMaterialAtlasIndices,
        wandMaterialAtlasIndices.get(0),
    ),

    RECURVE_BOW: new EquipCbItem(EquipSlotModelsCb.RECURVE_BOW.modelId, 'recurvebow', new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.2), null, matTexturedBowSize, bowMaterialAtlasIndices, bowMaterialAtlasIndices.get(0) ?? 12),

    BATTLEBOW: new EquipCbItem(EquipSlotModelsCb.BATTLEBOW.modelId, 'battlebow', new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.2), null, matTexturedBowSize, bowMaterialAtlasIndices, bowMaterialAtlasIndices.get(0) ?? 12),
}
