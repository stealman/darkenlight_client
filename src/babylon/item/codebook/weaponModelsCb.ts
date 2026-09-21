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
import { MaceVertexColorPalettes } from './vertexColorPalettes/maces'
import { PolearmVertexColorPalettes } from './vertexColorPalettes/polearms'
import { createVertexColorWeaponMaterial } from './vertexColorPalettes/vertexColorWeaponMaterial'

const matBowSize = new Vector2(5, 1)
const matLongswordSize = new Vector2(5, 1)
const matBroadswordSize = new Vector2(5, 1)
const matGreatswordSize = new Vector2(5, 1)
const matPickaxeSize = new Vector2(6, 1)
const matHandAxeSize = new Vector2(5, 1)
const matBattleAxeSize = new Vector2(5, 1)
const matGreatAxeSize = new Vector2(5, 1)
const matLargeBattleAxeSize = new Vector2(5, 1)
const matWarhammerSize = new Vector2(5, 1)
const matFutureWeaponSize = new Vector2(5, 1)

// Change this when a weapon GLB is replaced. The URL revision prevents an
// installed PWA from combining a newly deployed shader with an old HTTP-cached model.
export const WEAPON_MODEL_CACHE_VERSION = '20260922-warspear'

export const WeaponsCbManager = {
    BASE_WEAPONS_PATH: 'weapons/',
    itemSourceParent: null as TransformNode | null,

    bowMaterial: null as PBRCustomMaterial | null,
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
        this.longSwordMaterial = createVertexColorWeaponMaterial('longswordVertexColor', scene, SwordVertexColorPalettes.LONGSWORD)
        this.broadSwordMaterial = createVertexColorWeaponMaterial('broadswordVertexColor', scene, SwordVertexColorPalettes.BROADSWORD)
        this.greatSwordMaterial = createVertexColorWeaponMaterial('greatswordVertexColor', scene, SwordVertexColorPalettes.GREATSWORD)
        this.pickAxeMaterial = createVertexColorWeaponMaterial('pickaxeVertexColor', scene, AxeVertexColorPalettes.PICKAXE)
        this.handAxeMaterial = createVertexColorWeaponMaterial('handAxeVertexColor', scene, AxeVertexColorPalettes.HANDAXE)
        this.battleAxeMaterial = createVertexColorWeaponMaterial('battleAxeVertexColor', scene, AxeVertexColorPalettes.BATTLE_AXE)
        this.greatAxeMaterial = createVertexColorWeaponMaterial('greatAxeVertexColor', scene, AxeVertexColorPalettes.GREATAXE)
        this.largeBattleAxeMaterial = createVertexColorWeaponMaterial('largeBattleAxeVertexColor', scene, AxeVertexColorPalettes.LARGE_BATTLE_AXE)
        this.lightMaceMaterial = createVertexColorWeaponMaterial('lightMaceVertexColor', scene, MaceVertexColorPalettes.LIGHT_MACE)
        this.warmaceMaterial = createVertexColorWeaponMaterial('warmaceVertexColor', scene, MaceVertexColorPalettes.WARMACE)
        this.warhammerMaterial = createVertexColorWeaponMaterial('warhammerVertexColor', scene, MaceVertexColorPalettes.WARHAMMER)
        this.huntingSpearMaterial = createVertexColorWeaponMaterial('huntingSpearVertexColor', scene, PolearmVertexColorPalettes.HUNTING_SPEAR)
        this.warSpearMaterial = createVertexColorWeaponMaterial('warSpearVertexColor', scene, PolearmVertexColorPalettes.WAR_SPEAR)
        this.halberdMaterial = createVertexColorWeaponMaterial('halberdVertexColor', scene, PolearmVertexColorPalettes.HALBERD)

        map.set(WeaponModelsCb.LONGSWORD.id, await this.getItem(WeaponModelsCb.LONGSWORD, this.longSwordMaterial))
        map.set(WeaponModelsCb.BROADSWORD.id, await this.getItem(WeaponModelsCb.BROADSWORD, this.broadSwordMaterial))
        map.set(WeaponModelsCb.GREATSWORD.id, await this.getItem(WeaponModelsCb.GREATSWORD, this.greatSwordMaterial))
        map.set(WeaponModelsCb.HUNTINGBOW.id, await this.getItem(WeaponModelsCb.HUNTINGBOW, this.bowMaterial))
        map.set(WeaponModelsCb.PICKAXE.id, await this.getItem(WeaponModelsCb.PICKAXE, this.pickAxeMaterial))
        map.set(WeaponModelsCb.HAND_AXE.id, await this.getItem(WeaponModelsCb.HAND_AXE, this.handAxeMaterial))
        map.set(WeaponModelsCb.BATTLE_AXE.id, await this.getItem(WeaponModelsCb.BATTLE_AXE, this.battleAxeMaterial))
        map.set(WeaponModelsCb.GREATAXE.id, await this.getItem(WeaponModelsCb.GREATAXE, this.greatAxeMaterial))
        map.set(WeaponModelsCb.LARGE_BATTLE_AXE.id, await this.getItem(WeaponModelsCb.LARGE_BATTLE_AXE, this.largeBattleAxeMaterial))
        map.set(WeaponModelsCb.LIGHT_MACE.id, await this.getItem(WeaponModelsCb.LIGHT_MACE, this.lightMaceMaterial))
        map.set(WeaponModelsCb.WARMACE.id, await this.getItem(WeaponModelsCb.WARMACE, this.warmaceMaterial))
        map.set(WeaponModelsCb.WARHAMMER.id, await this.getItem(WeaponModelsCb.WARHAMMER, this.warhammerMaterial))
        map.set(WeaponModelsCb.HUNTING_SPEAR.id, await this.getItem(WeaponModelsCb.HUNTING_SPEAR, this.huntingSpearMaterial))
        map.set(WeaponModelsCb.WAR_SPEAR.id, await this.getItem(WeaponModelsCb.WAR_SPEAR, this.warSpearMaterial))
        map.set(WeaponModelsCb.HALBERD.id, await this.getItem(WeaponModelsCb.HALBERD, this.halberdMaterial))

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
    LONGSWORD: new EquipCbItem(EquipSlotModelsCb.LONGSWORD.modelId, 'longsword', Vector3.Zero(), new Vector3(0.2, 0.24, 0.4), new Vector3(0, 2.4, 0), matLongswordSize),

    BROADSWORD: new EquipCbItem(EquipSlotModelsCb.BROADSWORD.modelId, 'broadsword', Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2, 0), matBroadswordSize),

    GREATSWORD: new EquipCbItem(EquipSlotModelsCb.GREATSWORD.modelId, 'greatsword', Vector3.Zero(), new Vector3(0.24, 0.3, 0.3), new Vector3(0, 3.2, 0), matGreatswordSize),

    HAND_AXE: new EquipCbItem(EquipSlotModelsCb.HAND_AXE.modelId, 'handaxe', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2, 0), matHandAxeSize),

    BATTLE_AXE: new EquipCbItem(EquipSlotModelsCb.BATTLE_AXE.modelId, 'battleaxe', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2.2, 0), matBattleAxeSize),

    GREATAXE: new EquipCbItem(EquipSlotModelsCb.GREATAXE.modelId, 'greataxe', Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.5, 0), matGreatAxeSize),

    LARGE_BATTLE_AXE: new EquipCbItem(EquipSlotModelsCb.LARGE_BATTLE_AXE.modelId, 'largebattlexe', Vector3.Zero(), new Vector3(0.22, 0.24, 0.24), new Vector3(0, 2.5, 0), matLargeBattleAxeSize),

    PICKAXE: new EquipCbItem(EquipSlotModelsCb.PICKAXE.modelId, 'pickaxe', Vector3.Zero(), new Vector3(0.22, 0.24, 0.4), new Vector3(0, 2.2, 0), matPickaxeSize),

    LIGHT_MACE: new EquipCbItem(EquipSlotModelsCb.LIGHT_MACE.modelId, 'lightmace', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2, 0), matFutureWeaponSize),

    WARMACE: new EquipCbItem(EquipSlotModelsCb.WARMACE.modelId, 'warmace', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2.2, 0), matFutureWeaponSize),

    WARHAMMER: new EquipCbItem(EquipSlotModelsCb.WARHAMMER.modelId, 'warhammer', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2.5, 0), matWarhammerSize),

    HUNTING_SPEAR: new EquipCbItem(EquipSlotModelsCb.HUNTING_SPEAR.modelId, 'huntingspear', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 2.8, 0), matFutureWeaponSize),

    WAR_SPEAR: new EquipCbItem(EquipSlotModelsCb.WAR_SPEAR.modelId, 'warspear', Vector3.Zero(), new Vector3(0.24, 0.24, 0.24), new Vector3(0, 3.2, 0), matFutureWeaponSize),

    HALBERD: new EquipCbItem(EquipSlotModelsCb.HALBERD.modelId, 'halberd', new Vector3(0, -0.1, 0), new Vector3(0.24, 0.3, 0.24), new Vector3(-0.2, 3.2, 0), matFutureWeaponSize),

    HUNTINGBOW: new EquipCbItem(EquipSlotModelsCb.HUNTINGBOW.modelId, 'hunterbow', new Vector3(-0.1, 0, 0), new Vector3(0.17, 0.24, 0.4), null, matBowSize),

    RECURVE_BOW: new EquipCbItem(EquipSlotModelsCb.RECURVE_BOW.modelId, 'recurvebow', new Vector3(-0.1, 0, 0), new Vector3(0.24, 0.24, 0.24), null, matFutureWeaponSize),

    LONGBOW: new EquipCbItem(EquipSlotModelsCb.LONGBOW.modelId, 'longbow', new Vector3(-0.1, 0, 0), new Vector3(0.24, 0.24, 0.24), null, matFutureWeaponSize),
}

const FutureWeaponModels: EquipCbItem[] = [
    WeaponModelsCb.RECURVE_BOW,
    WeaponModelsCb.LONGBOW,
]
