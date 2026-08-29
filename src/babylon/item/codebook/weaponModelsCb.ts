import { Scene, TransformNode, Vector2, Vector3 } from '@babylonjs/core'
import { EquipItemType } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { Renderer } from '@/babylon/scene/renderer'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { Materials } from '@/babylon/materials'
import { BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/codebook/armorsModelsCb'
import { EquipSlotModelsCb } from '@/data/items/item'
import { SwordVertexColorPalettes } from './vertexColorPalettes/swords'
import { BowVertexColorPalettes } from './vertexColorPalettes/bows'
import { AxeVertexColorPalettes } from './vertexColorPalettes/axes'
import { createVertexColorWeaponMaterial } from './vertexColorPalettes/vertexColorWeaponMaterial'

const matBowSize = new Vector2(5, 1)
const matLongswordSize = new Vector2(5, 1)
const matBroadswordSize = new Vector2(5, 1)
const matPickaxeSize = new Vector2(6, 1)
const matGreatAxeSize = new Vector2(5, 1)
const matFutureWeaponSize = new Vector2(5, 1)

// Change this when a weapon GLB is replaced. The URL revision prevents an
// installed PWA from combining a newly deployed shader with an old HTTP-cached model.
export const WEAPON_MODEL_CACHE_VERSION = '20260830-vertex-colors'

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
        this.bowMaterial = createVertexColorWeaponMaterial('huntingBowVertexColor', scene, BowVertexColorPalettes.HUNTING_BOW)
        this.longSwordMaterial = createVertexColorWeaponMaterial('longswordVertexColor', scene, SwordVertexColorPalettes.LONGSWORD)
        this.broadSwordMaterial = createVertexColorWeaponMaterial('broadswordVertexColor', scene, SwordVertexColorPalettes.BROADSWORD)
        this.pickAxeMaterial = createVertexColorWeaponMaterial('pickaxeVertexColor', scene, AxeVertexColorPalettes.PICKAXE)
        this.greatAxeMaterial = createVertexColorWeaponMaterial('greatAxeVertexColor', scene, AxeVertexColorPalettes.GREATAXE)

        map.set(WeaponModelsCb.LONGSWORD.id, await this.getItem(WeaponModelsCb.LONGSWORD, this.longSwordMaterial))
        map.set(WeaponModelsCb.BROADSWORD.id, await this.getItem(WeaponModelsCb.BROADSWORD, this.broadSwordMaterial))
        map.set(WeaponModelsCb.HUNTINGBOW.id, await this.getItem(WeaponModelsCb.HUNTINGBOW, this.bowMaterial))
        map.set(WeaponModelsCb.PICKAXE.id, await this.getItem(WeaponModelsCb.PICKAXE, this.pickAxeMaterial))
        map.set(WeaponModelsCb.GREATAXE.id, await this.getItem(WeaponModelsCb.GREATAXE, this.greatAxeMaterial))

        for (const data of FutureWeaponModels) {
            map.set(data.id, await this.getItemOrFallback(data))
        }
    },

    async getItem(data: EquipCbItem, material: PBRCustomMaterial | null = null): Promise<EquipItemType> {
        const item = new EquipItemType(data)
        await item.initializeMeshWeapon(this.itemSourceParent!, Renderer.scene, `${this.BASE_WEAPONS_PATH}${data.model}.glb?v=${WEAPON_MODEL_CACHE_VERSION}`, material, data.pos, data.rot, data.scale)
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

    GREATSWORD: new EquipCbItem(EquipSlotModelsCb.GREATSWORD.modelId, "greatsword", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.5, 0), matFutureWeaponSize),

    HAND_AXE: new EquipCbItem(EquipSlotModelsCb.HAND_AXE.modelId, "handaxe", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2, 0), matFutureWeaponSize),

    BATTLE_AXE: new EquipCbItem(EquipSlotModelsCb.BATTLE_AXE.modelId, "battleaxe", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.2, 0), matFutureWeaponSize),

    GREATAXE: new EquipCbItem(EquipSlotModelsCb.GREATAXE.modelId, "greataxe", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.5, 0), matGreatAxeSize),

    PICKAXE: new EquipCbItem(EquipSlotModelsCb.PICKAXE.modelId, "pickaxe", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.2, 0), matPickaxeSize),

    LIGHT_MACE: new EquipCbItem(EquipSlotModelsCb.LIGHT_MACE.modelId, "lightmace", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2, 0), matFutureWeaponSize),

    FLANGED_MACE: new EquipCbItem(EquipSlotModelsCb.FLANGED_MACE.modelId, "flangedmace", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.2, 0), matFutureWeaponSize),

    WARHAMMER: new EquipCbItem(EquipSlotModelsCb.WARHAMMER.modelId, "warhammer", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.5, 0), matFutureWeaponSize),

    HUNTING_SPEAR: new EquipCbItem(EquipSlotModelsCb.HUNTING_SPEAR.modelId, "huntingspear", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.8, 0), matFutureWeaponSize),

    WAR_SPEAR: new EquipCbItem(EquipSlotModelsCb.WAR_SPEAR.modelId, "warspear", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 3.1, 0), matFutureWeaponSize),

    HALBERD: new EquipCbItem(EquipSlotModelsCb.HALBERD.modelId, "halberd", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 3, 0), matFutureWeaponSize),

    KNIFE: new EquipCbItem(EquipSlotModelsCb.KNIFE.modelId, "knife", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 1.6, 0), matFutureWeaponSize),

    STILETTO: new EquipCbItem(EquipSlotModelsCb.STILETTO.modelId, "stiletto", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 1.8, 0), matFutureWeaponSize),

    RONDEL: new EquipCbItem(EquipSlotModelsCb.RONDEL.modelId, "rondel", Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 1.9, 0), matFutureWeaponSize),

    HUNTINGBOW: new EquipCbItem(EquipSlotModelsCb.HUNTINGBOW.modelId, "hunterbow", new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.4), null, matBowSize),

    RECURVE_BOW: new EquipCbItem(EquipSlotModelsCb.RECURVE_BOW.modelId, "recurvebow", new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.4), null, matFutureWeaponSize),

    LONGBOW: new EquipCbItem(EquipSlotModelsCb.LONGBOW.modelId, "longbow", new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.4), null, matFutureWeaponSize),
}

const FutureWeaponModels: EquipCbItem[] = [
    WeaponModelsCb.GREATSWORD,
    WeaponModelsCb.HAND_AXE,
    WeaponModelsCb.BATTLE_AXE,
    WeaponModelsCb.LIGHT_MACE,
    WeaponModelsCb.FLANGED_MACE,
    WeaponModelsCb.WARHAMMER,
    WeaponModelsCb.HUNTING_SPEAR,
    WeaponModelsCb.WAR_SPEAR,
    WeaponModelsCb.HALBERD,
    WeaponModelsCb.KNIFE,
    WeaponModelsCb.STILETTO,
    WeaponModelsCb.RONDEL,
    WeaponModelsCb.RECURVE_BOW,
    WeaponModelsCb.LONGBOW,
]
