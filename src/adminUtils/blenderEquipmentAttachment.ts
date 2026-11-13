import { Matrix, Mesh, SceneLoader, Vector3, VertexData } from '@babylonjs/core'
import type { AssetContainer, Scene } from '@babylonjs/core'
import type { EquipItem, EquipItemType } from '@/babylon/item/equipManager'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'

interface BlenderEquipmentAttachment {
    boneName: string
    localMatrix: Matrix
}

export const blenderEquipmentAttachments = new Map<number, BlenderEquipmentAttachment>()

export function readBlenderEquipmentAttachment(container: AssetContainer, boneName: string, meshName?: string) {
    const bone = container.skeletons.flatMap(skeleton => skeleton.bones).find(bone => bone.name === boneName)
    const joint = bone?.getTransformNode()
    if (!joint) throw new Error(`Blender export is missing bone ${boneName}`)
    const meshes = container.meshes.filter(mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0
        && !mesh.skeleton && mesh.isDescendantOf(joint) && (meshName == null || mesh.name === meshName))
    if (meshes.length !== 1) throw new Error(`Expected one rigid equipment mesh ${meshName ?? ''} under ${boneName}, found ${meshes.length}`)
    const mesh = meshes[0] as Mesh
    const localMatrix = mesh.computeWorldMatrix(true).multiply(joint.computeWorldMatrix(true).clone().invert())
    return { boneName, localMatrix, vertexData: VertexData.ExtractFromMesh(mesh, true, true) }
}

export async function loadBlenderEquipmentAttachment(scene: Scene, type: EquipItemType, url: string, boneName: string) {
    await loadBlenderEquipmentAttachments(scene, url, [{ type, boneName }])
}

export async function loadBlenderEquipmentAttachments(
    scene: Scene,
    url: string,
    imports: Array<{ type: EquipItemType, boneName: string, meshName?: string }>,
) {
    const container = await SceneLoader.LoadAssetContainerAsync('', modelAssetUrl(url), scene)
    try {
        const attachments = imports.map(({ type, boneName, meshName }) => {
            if (!type.mesh) throw new Error(`Equipment mesh ${type.id} is not initialized`)
            return { type, target: type.mesh, attachment: readBlenderEquipmentAttachment(container, boneName, meshName) }
        })
        attachments.forEach(({ type, target, attachment }) => {
            // Replace only this preview's geometry. Keep its runtime material, atlas and thin buffers.
            target.makeGeometryUnique()
            attachment.vertexData.applyToMesh(target)
            target.position.setAll(0)
            target.rotationQuaternion = null
            target.rotation.setAll(0)
            target.scaling.copyFrom(Vector3.One())
            blenderEquipmentAttachments.set(type.id, { boneName: attachment.boneName, localMatrix: attachment.localMatrix })
        })
    } finally {
        container.dispose()
    }
}

export function bindBlenderEquipment(item: EquipItem) {
    const attachment = blenderEquipmentAttachments.get(item.type.id)
    if (!attachment) throw new Error(`No Blender attachment loaded for equipment ${item.type.id}`)
    if (item.bone.name !== attachment.boneName) throw new Error(`Equipment ${item.type.id} must attach to ${attachment.boneName}`)
    const joint = item.bone.getTransformNode()
    if (!joint) throw new Error(`Equipment ${item.type.id} has no animated joint node`)
    const result = Matrix.Identity()
    item.scale.setAll(1)
    item.scaleMatrix = Matrix.Identity()
    item.itemRotation = null
    item.itemPosition = Vector3.Zero()
    item.onFrame = () => {
        // Use the exported joint hierarchy, including its armature transform.
        attachment.localMatrix.multiplyToRef(joint.computeWorldMatrix(true), result)
        item.modelModifierMatrix = result
        item.position.setAll(0)
        item.quaternion.copyFromFloats(0, 0, 0, 1)
    }
}
