import type { Scene } from '@babylonjs/core'
import type { EquipItemType } from '@/babylon/item/equipManager'
import { loadRawArmorGeometry } from '@/babylon/character/characterEquipmentFitting'

export async function initializePreviewArmorSources(scene: Scene, types: Map<number, EquipItemType>) {
    const { TEXTURED_ARMOR_ASSETS } = await import('@/babylon/item/codebook/armorsModelsCb')
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
}
