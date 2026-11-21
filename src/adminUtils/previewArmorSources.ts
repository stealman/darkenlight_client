import { Material, Mesh } from '@babylonjs/core'
import type { PBRMaterial, Scene, Texture } from '@babylonjs/core'
import type { EquipItem, EquipItemType } from '@/babylon/item/equipManager'
import { loadRawArmorGeometry } from '@/babylon/character/characterEquipmentFitting'

export async function initializePreviewArmorSources(
    scene: Scene,
    types: Map<number, EquipItemType>,
    leatherAtlases: {male: Texture, female: Texture, pauldron: Texture, leg: Texture, helmet: Texture},
) {
    const { TEXTURED_ARMOR_ASSETS, ArmorModelsCb, LeatherArmorAssets, createLeatherArmorMaterial } = await import('@/babylon/item/codebook/armorsModelsCb')
    const atlases = new Map([
        [ArmorModelsCb.LEATHER_ARMOR_MALE.id, leatherAtlases.male],
        [ArmorModelsCb.LEATHER_HELMET.id, leatherAtlases.helmet],
        [ArmorModelsCb.LEATHER_PAULDRONS.id, leatherAtlases.pauldron],
        [ArmorModelsCb.LEATHER_GREAVES.id, leatherAtlases.leg],
    ])
    await Promise.all([...TEXTURED_ARMOR_ASSETS].map(async ([id, asset]) => {
        const base = types.get(id)
        if (!base?.mesh) throw new Error(`Armor ${id} is not initialized`)
        const file = asset.modelFile.split('?')[0]
        const data = await loadRawArmorGeometry(scene, file)
        base.mesh.makeGeometryUnique()
        data.applyToMesh(base.mesh)
        base.mesh.position.setAll(0)
        base.mesh.rotationQuaternion = null
        base.mesh.rotation.setAll(0)
        base.mesh.scaling.setAll(1)
        const atlas = atlases.get(id)
        if (atlas) {
            // Raw geometry uses the default mesh orientation; the merged GLB mesh overrides it.
            base.mesh.sideOrientation = scene.useRightHandedSystem ? Material.ClockWiseSideOrientation : Material.CounterClockWiseSideOrientation
            const material = base.mesh.material as PBRMaterial
            material.albedoTexture?.dispose()
            material.albedoTexture = atlas
        }
    }))
    const { EquipItemType, EquipManager } = await import('@/babylon/item/equipManager')
    const { Lights } = await import('@/babylon/scene/lights')
    const femaleSources = new Map<number, EquipItemType>()
    const femaleAssets: Array<[number, string]> = [
        [ArmorModelsCb.CHAIN_MAIL_MALE.id, 'female-armor-chain.glb'],
        [ArmorModelsCb.PLATE_ARMOR_MALE.id, 'female-armor-plate.glb'],
        [ArmorModelsCb.LEATHER_ARMOR_MALE.id, LeatherArmorAssets.female.modelFile],
    ]
    await Promise.all(femaleAssets.map(async ([id, file]) => {
        const male = types.get(id)!
        const female = new EquipItemType(male.cbData)
        const data = await loadRawArmorGeometry(scene, file)
        const mesh = new Mesh(`adminUtilsFemaleArmor-${id}`, scene)
        data.applyToMesh(mesh)
        mesh.material = id === ArmorModelsCb.LEATHER_ARMOR_MALE.id
            ? createLeatherArmorMaterial(scene, 'adminUtilsFemaleLeatherTorso', LeatherArmorAssets.female, leatherAtlases.female)
            : male.mesh!.material
        mesh.parent = male.mesh!.parent
        mesh.receiveShadows = true
        mesh.alwaysSelectAsActiveMesh = true
        mesh.setEnabled(false)
        female.mesh = mesh
        Lights.registerDynamicLightMesh(mesh)
        femaleSources.set(id, female)
    }))
    return {
        useSource(item: EquipItem, variant: 'male' | 'female') {
            const female = femaleSources.get(item.type.id)
            if (!female) return
            const source = variant === 'female' ? female : types.get(item.type.id)!
            if (item.type === source) return
            EquipManager.removeEquippedItem(item)
            item.type = source
            EquipManager.addEquippedItem(item)
        },
    }
}
