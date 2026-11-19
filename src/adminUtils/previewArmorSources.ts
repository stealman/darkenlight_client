import { Mesh } from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import type { EquipItem, EquipItemType } from '@/babylon/item/equipManager'
import { loadRawArmorGeometry } from '@/babylon/character/characterEquipmentFitting'

export async function initializePreviewArmorSources(scene: Scene, types: Map<number, EquipItemType>) {
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
    const chainMailId = ArmorModelsCb.CHAIN_MAIL_MALE.id
    const maleChainMail = types.get(chainMailId)!
    const femaleChainMail = new EquipItemType(maleChainMail.cbData)
    const mesh = new Mesh('adminUtilsFemaleChainMail', scene)
    const data = await loadRawArmorGeometry(scene, 'female-armor-chain.glb')
    data.applyToMesh(mesh)
    mesh.material = maleChainMail.mesh!.material
    mesh.parent = maleChainMail.mesh!.parent
    mesh.receiveShadows = true
    mesh.alwaysSelectAsActiveMesh = true
    mesh.setEnabled(false)
    femaleChainMail.mesh = mesh
    Lights.registerDynamicLightMesh(mesh)
    return {
        useChainMailSource(item: EquipItem, variant: 'male' | 'female') {
            if (item.type.id !== chainMailId) return
            const source = variant === 'female' ? femaleChainMail : maleChainMail
            if (item.type === source) return
            EquipManager.removeEquippedItem(item)
            item.type = source
            EquipManager.addEquippedItem(item)
        },
    }
}
