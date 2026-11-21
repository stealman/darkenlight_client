import { Mesh, Vector2, Vector3 } from '@babylonjs/core'
import type { Scene, Texture } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import type { EquipItem, EquipItemType } from '@/babylon/item/equipManager'
import { loadRawArmorGeometry } from '@/babylon/character/characterEquipmentFitting'

// Preview-only IDs below the range of runtime armor fitting sources.
export const PREVIEW_LEATHER_TORSO_ID = 900
export const PREVIEW_LEATHER_PAULDRON_ID = 901
export const PREVIEW_LEATHER_LEG_ID = 902
export const PREVIEW_LEATHER_HELMET_ID = 903

async function createLeatherPreview(
    scene: Scene,
    id: number,
    name: string,
    file: string,
    atlas: Texture,
    atlasIndices: Map<number, number>,
    normalFile?: string,
) {
    const [{EquipItemType}, {EquipCbItem}, {Lights}, {createArmorNormalTexture}, geometry] = await Promise.all([
        import('@/babylon/item/equipManager'),
        import('@/babylon/item/codebook/equipCbItem'),
        import('@/babylon/scene/lights'),
        import('@/babylon/item/codebook/armorsModelsCb'),
        loadRawArmorGeometry(scene, file),
    ])
    const material = new PBRCustomMaterial(name, scene)
    material.albedoTexture = atlas
    if (normalFile) material.bumpTexture = createArmorNormalTexture(scene, normalFile)
    material.metallic = 0
    material.roughness = 1
    // Show the inside of the helmet and the reversed faces of the mirrored leg.
    const renderBackFaces = id === PREVIEW_LEATHER_HELMET_ID || id === PREVIEW_LEATHER_LEG_ID
    material.backFaceCulling = !renderBackFaces
    material.twoSidedLighting = !renderBackFaces
    material.usePhysicalLightFalloff = false
    material.AddAttribute('uvc')
    material.Vertex_Definitions('attribute vec2 uvc;')
    // Apply the per-instance tile offset only to the color atlas.
    material.Vertex_MainEnd(`
        #if defined(ALBEDO) && ALBEDODIRECTUV == 0
            vAlbedoUV += vec2(albedoMatrix * vec4(uvc, 0.0, 0.0));
        #endif
    `)

    const mesh = new Mesh(name, scene)
    geometry.applyToMesh(mesh)
    mesh.material = material
    mesh.receiveShadows = true
    mesh.alwaysSelectAsActiveMesh = true
    mesh.setEnabled(false)
    const type = new EquipItemType(new EquipCbItem(id, mesh.name,
        Vector3.Zero(), Vector3.One(), null, new Vector2(4, 4), atlasIndices))
    type.mesh = mesh
    Lights.registerDynamicLightMesh(mesh)
    return type
}

export async function initializePreviewArmorSources(
    scene: Scene,
    types: Map<number, EquipItemType>,
    leatherAtlases: {male: Texture, female: Texture, pauldron: Texture, leg: Texture, helmet: Texture},
    leatherAtlasIndices: Map<number, number>,
) {
    const { TEXTURED_ARMOR_ASSETS, ArmorModelsCb } = await import('@/babylon/item/codebook/armorsModelsCb')
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
    }))
    const { EquipItemType, EquipManager } = await import('@/babylon/item/equipManager')
    const { Lights } = await import('@/babylon/scene/lights')
    const [maleLeather, femaleLeather, leatherPauldron, leatherLeg, leatherHelmet] = await Promise.all([
        createLeatherPreview(scene, PREVIEW_LEATHER_TORSO_ID, 'adminUtilsMaleLeatherTorso',
            'male-armor-leather.glb', leatherAtlases.male, leatherAtlasIndices, 'leather_armor_male_normal.png'),
        createLeatherPreview(scene, PREVIEW_LEATHER_TORSO_ID, 'adminUtilsFemaleLeatherTorso',
            'female-armor-leather.glb', leatherAtlases.female, leatherAtlasIndices, 'leather_armor_female_normal.png'),
        createLeatherPreview(scene, PREVIEW_LEATHER_PAULDRON_ID, 'adminUtilsLeatherPauldron',
            'pauldron-leather.glb', leatherAtlases.pauldron, leatherAtlasIndices, 'leather_pauldron_normal.png'),
        createLeatherPreview(scene, PREVIEW_LEATHER_LEG_ID, 'adminUtilsLeatherLeg',
            'male-leg-leather.glb', leatherAtlases.leg, leatherAtlasIndices, 'leather_leg_normal.png'),
        createLeatherPreview(scene, PREVIEW_LEATHER_HELMET_ID, 'adminUtilsLeatherHelmet',
            'helmet-leather.glb', leatherAtlases.helmet, leatherAtlasIndices),
    ])
    types.set(PREVIEW_LEATHER_TORSO_ID, maleLeather)
    types.set(PREVIEW_LEATHER_PAULDRON_ID, leatherPauldron)
    types.set(PREVIEW_LEATHER_LEG_ID, leatherLeg)
    types.set(PREVIEW_LEATHER_HELMET_ID, leatherHelmet)
    const femaleSources = new Map<number, EquipItemType>([[PREVIEW_LEATHER_TORSO_ID, femaleLeather]])
    const femaleAssets: Array<[number, string]> = [
        [ArmorModelsCb.CHAIN_MAIL_MALE.id, 'female-armor-chain.glb'],
        [ArmorModelsCb.PLATE_ARMOR_MALE.id, 'female-armor-plate.glb'],
    ]
    await Promise.all(femaleAssets.map(async ([id, file]) => {
        const male = types.get(id)!
        const female = new EquipItemType(male.cbData)
        const data = await loadRawArmorGeometry(scene, file)
        const mesh = new Mesh(`adminUtilsFemaleArmor-${id}`, scene)
        data.applyToMesh(mesh)
        mesh.material = male.mesh!.material
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
