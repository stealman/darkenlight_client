import { Scene, Texture, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { EquipItemType } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Materials } from '@/babylon/materials'
import { BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/codebook/armorsModelsCb'
import { EquipSlotModelsCb } from '@/data/items/item'
import { SwordVertexColorPalettes } from './vertexColorPalettes/swords'
import { BowVertexColorPalettes } from './vertexColorPalettes/bows'
import { AxeVertexColorPalettes } from './vertexColorPalettes/axes'
import { MaceVertexColorPalettes } from './vertexColorPalettes/maces'
import { PolearmVertexColorPalettes } from './vertexColorPalettes/polearms'
import { createVertexColorWeaponMaterial } from './vertexColorPalettes/vertexColorWeaponMaterial'

const matBowSize = new Vector2(6, 1)
const matLongswordSize = new Vector2(4, 4)
const matBroadswordSize = new Vector2(4, 4)
const matGreatswordSize = new Vector2(5, 1)
const matPickaxeSize = new Vector2(4, 4)
const matHandAxeSize = new Vector2(4, 4)
const matBattleAxeSize = new Vector2(4, 4)
const matGreatAxeSize = new Vector2(4, 4)
const matLargeBattleAxeSize = new Vector2(5, 1)
const matWarhammerSize = new Vector2(5, 1)
const matFutureWeaponSize = new Vector2(5, 1)
const matHalberdSize = new Vector2(4, 4)
const matHuntingSpearSize = new Vector2(4, 4)

// Change this when a weapon GLB is replaced. The URL revision prevents an
// installed PWA from combining a newly deployed shader with an old HTTP-cached model.
export const WEAPON_MODEL_CACHE_VERSION = '20260930-battlebow-v1'
const LONGSWORD_ASSET_CACHE_VERSION = '20261021-material-atlas-v1'
const BROADSWORD_ASSET_CACHE_VERSION = '20261021-material-atlas-v2'
const GREATAXE_ASSET_CACHE_VERSION = '20261022-material-atlas-v1'
const GREATAXE_NORMAL_CACHE_VERSION = '20261022-single-tile-v1'
const HALBERD_ASSET_CACHE_VERSION = '20261022-material-atlas-v1'
const PICKAXE_ASSET_CACHE_VERSION = '20261022-material-atlas-v1'
const HANDAXE_ASSET_CACHE_VERSION = '20261022-material-atlas-v2'
const BATTLEAXE_ASSET_CACHE_VERSION = '20261022-material-atlas-v1'
const HUNTINGSPEAR_ASSET_CACHE_VERSION = '20261022-material-atlas-v1'

const createWeaponMaterialAtlasIndices = (atlasSize: Vector2) => new Map<number, number>(
    Array.from({ length: 5 }, (_, atlasTile) => {
        const tileX = atlasTile % atlasSize.x
        const tileY = Math.floor(atlasTile / atlasSize.x)
        return [atlasTile, (atlasSize.y - 1 - tileY) * atlasSize.x + tileX] as [number, number]
    }),
)
const longswordMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matLongswordSize)
const broadswordMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matBroadswordSize)
const greataxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matGreatAxeSize)
const halberdMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matHalberdSize)
const pickaxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matPickaxeSize)
const handaxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matHandAxeSize)
const battleaxeMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matBattleAxeSize)
const huntingspearMaterialAtlasIndices = createWeaponMaterialAtlasIndices(matHuntingSpearSize)

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
    itemSourceParent: null as TransformNode | null,

    bowMaterial: null as PBRCustomMaterial | null,
    recurveBowMaterial: null as PBRCustomMaterial | null,
    battleBowMaterial: null as PBRCustomMaterial | null,
    longSwordMaterial: null as PBRCustomMaterial | null,
    broadSwordMaterial: null as PBRCustomMaterial | null,
    greatSwordMaterial: null as PBRCustomMaterial | null,
    pickAxeMaterial: null as PBRCustomMaterial | null,
    handAxeMaterial: null as PBRCustomMaterial | null,
    battleAxeMaterial: null as PBRCustomMaterial | null,
    greatAxeMaterial: null as PBRCustomMaterial | null,
    largeBattleAxeMaterial: null as PBRCustomMaterial | null,
    lightMaceMaterial: null as PBRCustomMaterial | null,
    warmaceMaterial: null as PBRCustomMaterial | null,
    warhammerMaterial: null as PBRCustomMaterial | null,
    huntingSpearMaterial: null as PBRCustomMaterial | null,
    warSpearMaterial: null as PBRCustomMaterial | null,
    halberdMaterial: null as PBRCustomMaterial | null,

    async initMelee(map: Map<number, EquipItemType>, scene: Scene) {
        this.itemSourceParent = new TransformNode("mobWeaponSources", scene)

        // Load materials
        this.bowMaterial = createVertexColorWeaponMaterial('huntingBowVertexColor', scene, BowVertexColorPalettes.HUNTING_BOW)
        this.recurveBowMaterial = createVertexColorWeaponMaterial('recurveBowVertexColor', scene, BowVertexColorPalettes.RECURVE_BOW)
        this.battleBowMaterial = createVertexColorWeaponMaterial('battleBowVertexColor', scene, BowVertexColorPalettes.BATTLE_BOW)
        this.greatSwordMaterial = createVertexColorWeaponMaterial('greatswordVertexColor', scene, SwordVertexColorPalettes.GREATSWORD)
        this.largeBattleAxeMaterial = createVertexColorWeaponMaterial('largeBattleAxeVertexColor', scene, AxeVertexColorPalettes.LARGE_BATTLE_AXE)
        this.lightMaceMaterial = createVertexColorWeaponMaterial('lightMaceVertexColor', scene, MaceVertexColorPalettes.LIGHT_MACE)
        this.warmaceMaterial = createVertexColorWeaponMaterial('warmaceVertexColor', scene, MaceVertexColorPalettes.WARMACE)
        this.warhammerMaterial = createVertexColorWeaponMaterial('warhammerVertexColor', scene, MaceVertexColorPalettes.WARHAMMER)
        this.warSpearMaterial = createVertexColorWeaponMaterial('warSpearVertexColor', scene, PolearmVertexColorPalettes.WAR_SPEAR)

        await this.initLongsword(map, scene)
        await this.initBroadsword(map, scene)
        map.set(WeaponModelsCb.GREATSWORD.id, await this.getItem(WeaponModelsCb.GREATSWORD, this.greatSwordMaterial))
        map.set(WeaponModelsCb.HUNTINGBOW.id, await this.getItem(WeaponModelsCb.HUNTINGBOW, this.bowMaterial))
        map.set(WeaponModelsCb.RECURVE_BOW.id, await this.getItem(WeaponModelsCb.RECURVE_BOW, this.recurveBowMaterial))
        map.set(WeaponModelsCb.BATTLEBOW.id, await this.getItem(WeaponModelsCb.BATTLEBOW, this.battleBowMaterial))
        await this.initPickaxe(map, scene)
        await this.initHandAxe(map, scene)
        await this.initBattleAxe(map, scene)
        await this.initGreatAxe(map, scene)
        map.set(WeaponModelsCb.LARGE_BATTLE_AXE.id, await this.getItem(WeaponModelsCb.LARGE_BATTLE_AXE, this.largeBattleAxeMaterial))
        map.set(WeaponModelsCb.LIGHT_MACE.id, await this.getItem(WeaponModelsCb.LIGHT_MACE, this.lightMaceMaterial))
        map.set(WeaponModelsCb.WARMACE.id, await this.getItem(WeaponModelsCb.WARMACE, this.warmaceMaterial))
        map.set(WeaponModelsCb.WARHAMMER.id, await this.getItem(WeaponModelsCb.WARHAMMER, this.warhammerMaterial))
        await this.initHuntingSpear(map, scene)
        map.set(WeaponModelsCb.WAR_SPEAR.id, await this.getItem(WeaponModelsCb.WAR_SPEAR, this.warSpearMaterial))
        await this.initHalberd(map, scene)

    },

    async initLongsword(map: Map<number, EquipItemType>, scene: Scene) {
        if (this.itemSourceParent == null) {
            this.itemSourceParent = new TransformNode('mobWeaponSources', scene)
        }
        this.longSwordMaterial = Materials.getPBRCustomMaterialFrom(
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
        this.longSwordMaterial.backFaceCulling = false
        this.longSwordMaterial.twoSidedLighting = false
        this.longSwordMaterial.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.LONGSWORD.id, await this.getItem(
            WeaponModelsCb.LONGSWORD,
            this.longSwordMaterial,
            `tripo-longsword.glb?v=${LONGSWORD_ASSET_CACHE_VERSION}`,
        ))
    },

    async initBroadsword(map: Map<number, EquipItemType>, scene: Scene) {
        if (this.itemSourceParent == null) {
            this.itemSourceParent = new TransformNode('mobWeaponSources', scene)
        }
        this.broadSwordMaterial = Materials.getPBRCustomMaterialFrom(
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
        this.broadSwordMaterial.backFaceCulling = false
        this.broadSwordMaterial.twoSidedLighting = false
        this.broadSwordMaterial.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.BROADSWORD.id, await this.getItem(
            WeaponModelsCb.BROADSWORD,
            this.broadSwordMaterial,
            `tripo-broadsword.glb?v=${BROADSWORD_ASSET_CACHE_VERSION}`,
        ))
    },

    async initGreatAxe(map: Map<number, EquipItemType>, scene: Scene) {
        if (this.itemSourceParent == null) {
            this.itemSourceParent = new TransformNode('mobWeaponSources', scene)
        }
        this.greatAxeMaterial = Materials.getPBRCustomMaterialFrom(
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
        this.greatAxeMaterial.backFaceCulling = false
        this.greatAxeMaterial.twoSidedLighting = false
        this.greatAxeMaterial.usePhysicalLightFalloff = false
        this.greatAxeMaterial.bumpTexture = createWeaponNormalTexture(scene, 'greataxe_normal.png', GREATAXE_NORMAL_CACHE_VERSION)
        map.set(WeaponModelsCb.GREATAXE.id, await this.getItem(
            WeaponModelsCb.GREATAXE,
            this.greatAxeMaterial,
            `tripo-greataxe.glb?v=${GREATAXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initHalberd(map: Map<number, EquipItemType>, scene: Scene) {
        if (this.itemSourceParent == null) {
            this.itemSourceParent = new TransformNode('mobWeaponSources', scene)
        }
        this.halberdMaterial = Materials.getPBRCustomMaterialFrom(
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
        this.halberdMaterial.backFaceCulling = false
        this.halberdMaterial.twoSidedLighting = false
        this.halberdMaterial.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.HALBERD.id, await this.getItem(
            WeaponModelsCb.HALBERD,
            this.halberdMaterial,
            `tripo-halberd.glb?v=${HALBERD_ASSET_CACHE_VERSION}`,
        ))
    },

    async initPickaxe(map: Map<number, EquipItemType>, scene: Scene) {
        if (this.itemSourceParent == null) {
            this.itemSourceParent = new TransformNode('mobWeaponSources', scene)
        }
        this.pickAxeMaterial = Materials.getPBRCustomMaterialFrom(
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
        this.pickAxeMaterial.backFaceCulling = false
        this.pickAxeMaterial.twoSidedLighting = false
        this.pickAxeMaterial.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.PICKAXE.id, await this.getItem(
            WeaponModelsCb.PICKAXE,
            this.pickAxeMaterial,
            `tripo-pickaxe.glb?v=${PICKAXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initHandAxe(map: Map<number, EquipItemType>, scene: Scene) {
        if (this.itemSourceParent == null) {
            this.itemSourceParent = new TransformNode('mobWeaponSources', scene)
        }
        this.handAxeMaterial = Materials.getPBRCustomMaterialFrom(
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
        this.handAxeMaterial.backFaceCulling = false
        this.handAxeMaterial.twoSidedLighting = false
        this.handAxeMaterial.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.HAND_AXE.id, await this.getItem(
            WeaponModelsCb.HAND_AXE,
            this.handAxeMaterial,
            `tripo-handaxe.glb?v=${HANDAXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initBattleAxe(map: Map<number, EquipItemType>, scene: Scene) {
        if (this.itemSourceParent == null) {
            this.itemSourceParent = new TransformNode('mobWeaponSources', scene)
        }
        this.battleAxeMaterial = Materials.getPBRCustomMaterialFrom(
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
        this.battleAxeMaterial.backFaceCulling = false
        this.battleAxeMaterial.twoSidedLighting = false
        this.battleAxeMaterial.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.BATTLE_AXE.id, await this.getItem(
            WeaponModelsCb.BATTLE_AXE,
            this.battleAxeMaterial,
            `tripo-battleaxe.glb?v=${BATTLEAXE_ASSET_CACHE_VERSION}`,
        ))
    },

    async initHuntingSpear(map: Map<number, EquipItemType>, scene: Scene) {
        if (this.itemSourceParent == null) {
            this.itemSourceParent = new TransformNode('mobWeaponSources', scene)
        }
        this.huntingSpearMaterial = Materials.getPBRCustomMaterialFrom(
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
        this.huntingSpearMaterial.backFaceCulling = false
        this.huntingSpearMaterial.twoSidedLighting = false
        this.huntingSpearMaterial.usePhysicalLightFalloff = false
        map.set(WeaponModelsCb.HUNTING_SPEAR.id, await this.getItem(
            WeaponModelsCb.HUNTING_SPEAR,
            this.huntingSpearMaterial,
            `tripo-huntingspear.glb?v=${HUNTINGSPEAR_ASSET_CACHE_VERSION}`,
        ))
    },

    async getItem(data: EquipCbItem, material: PBRCustomMaterial | null = null, fileName = `${data.model}.glb?v=${WEAPON_MODEL_CACHE_VERSION}`): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        await item.initializeMeshGlb(this.itemSourceParent!, this.itemSourceParent!.getScene(), `${this.BASE_WEAPONS_PATH}${fileName}`, material, data.pos, data.rot, data.scale)
        return item
    },

    async getItemOrFallback(data: EquipCbItem): Promise<EquipItemType> {
        const material = this.getMaterial(data.model, new Vector2(data.matCols, data.matRows))
        try {
            return await this.getItem(data, material)
        } catch (error) {
            console.warn(`Weapon model '${data.model}' is unavailable; using longsword fallback.`, error)
            return this.getItem(WeaponModelsCb.LONGSWORD, this.longSwordMaterial)
        }
    },

    getMaterial(texture: string, matSize: Vector2, invertV: boolean = true) {
        const mat = Materials.getPBRCustomMaterialFrom(this.itemSourceParent!.getScene(), texture, BASE_EQUIP_MATERIAL_PATH + "weapons/", texture + ".png", 1 / matSize.x, 1 / matSize.y, false, {
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

    GREATSWORD: new EquipCbItem(EquipSlotModelsCb.GREATSWORD.modelId, 'greatsword', Vector3.Zero(), new Vector3(0.24, 0.3, 0.3), new Vector3(0, 3.2, 0), matGreatswordSize),

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

    LARGE_BATTLE_AXE: new EquipCbItem(EquipSlotModelsCb.LARGE_BATTLE_AXE.modelId, 'largebattlexe', Vector3.Zero(), new Vector3(0.22, 0.24, 0.24), new Vector3(0, 2.5, 0), matLargeBattleAxeSize),

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

    LIGHT_MACE: new EquipCbItem(EquipSlotModelsCb.LIGHT_MACE.modelId, 'lightmace', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2, 0), matFutureWeaponSize),

    WARMACE: new EquipCbItem(EquipSlotModelsCb.WARMACE.modelId, 'warmace', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2.2, 0), matFutureWeaponSize),

    WARHAMMER: new EquipCbItem(EquipSlotModelsCb.WARHAMMER.modelId, 'warhammer', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2.5, 0), matWarhammerSize),

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

    WAR_SPEAR: new EquipCbItem(EquipSlotModelsCb.WAR_SPEAR.modelId, 'warspear', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 3.2, 0), matFutureWeaponSize),

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

    HUNTINGBOW: new EquipCbItem(EquipSlotModelsCb.HUNTINGBOW.modelId, 'hunterbow', new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.2), null, matBowSize),

    RECURVE_BOW: new EquipCbItem(EquipSlotModelsCb.RECURVE_BOW.modelId, 'recurvebow', new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.2), null, matBowSize),

    BATTLEBOW: new EquipCbItem(EquipSlotModelsCb.BATTLEBOW.modelId, 'battlebow', new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.2), null, matBowSize),
}
