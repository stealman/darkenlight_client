import {
    Bone, Color4, GPUParticleSystem, Matrix,
    Mesh, ParticleSystem,
    Quaternion,
    Scene,
    SceneLoader, Texture, TrailMesh, TransformNode, Vector2, Vector3, Vector4,
} from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { MobWeaponsCbManager } from '@/babylon/item/codebook/mobWeaponsCb'
import { MobArmorsCbManager } from '@/babylon/item/codebook/mobArmorsCb'
import { MobEquipItemData } from '@/babylon/item/codebook/mobEquipItemData'
import { Renderer } from '@/babylon/scene/renderer'
import { Materials } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { BabylonUtils } from '@/babylon/utils'

export class MobEquipItem {
    parent: EquipBearer | null = null
    type: MobEquipItemType
    matVector: Vector2

    position: Vector3 = Vector3.Zero()
    quaternion: Quaternion = Quaternion.Identity()
    bone: Bone
    scale: Vector3
    itemRotation: Quaternion | null = null
    itemPosition: Vector3 | null = null
    localPosition: Vector3 = Vector3.Zero()
    boneRotationQuaternion: Quaternion = Quaternion.Identity()
    localScale: Vector3 = Vector3.One()
    scaleMatrix: Matrix = Matrix.Identity()
    weaponTrail: TrailMesh | null = null

    constructor(type: MobEquipItemType, matIndex: number, parent: EquipBearer, bone: Bone, scale: Vector3 | null, rotation: Vector3 | null, position: Vector3 | null, addWeaponTrail: boolean = false) {
        this.type = type
        this.parent = parent
        this.bone = bone
        this.scale = scale ? scale : Vector3.One()
        this.itemPosition = position ? position : Vector3.Zero()
        this.itemRotation = rotation ? Quaternion.FromEulerVector(rotation) : null
        if (addWeaponTrail) {
            this.weaponTrail = this.createWeaponTrail(this.bone)
        }

        const matRow = (type.cbData.matsY * 2) - ((Math.floor(matIndex / type.cbData.matsX) * 2) + 1.5)
        const matCol = ((matIndex % type.cbData.matsX) * 2) + 0.5
        this.matVector = new Vector2(matCol, matRow)
        this.scaleMatrix = Matrix.Scaling(this.scale.x, this.scale.y, this.scale.z);
    }

    onFrame() {
        this.bone.computeWorldMatrix(true);
        this.bone.getFinalMatrix().decompose(this.localScale, this.boneRotationQuaternion, this.localPosition)

        this.quaternion = this.parent!.rotationQuaternion.multiply(this.boneRotationQuaternion)

        // Apply specific item rotation
        if (this.itemRotation) {
            this.quaternion = this.quaternion.multiply(this.itemRotation)
        }
        this.position = Vector3.TransformCoordinates(this.localPosition, this.parent!.worldMatrix)

        // Apply specific item position offset
        if (this.itemPosition) {
            const offset = Vector3.TransformCoordinates(this.itemPosition, Matrix.FromQuaternionToRef(this.parent!.rotationQuaternion, new Matrix()))
            this.position.addInPlace(offset)
        }
    }

    createWeaponTrail(bone: Bone): TrailMesh {
        const tip = new TransformNode('weaponTip' + this.parent?.getOwnerId(), Renderer.scene)
        tip.attachToBone(bone, this.parent!.getMasterNode())

        // Position the tip at the weapon tip position from the codebook data and scale it according to the weapon scale
        const p = this.type.cbData.weaponTipPosition!
        const s = this.parent?.getWeaponScale() ?? Vector3.One()

        tip.position.set(
            p.x * s.x,
            p.y * s.y,
            p.z * s.z
        )
        const trail = new TrailMesh('swordTrail', tip, Renderer.scene, 0.3, 60, true)
        trail.material = Materials.weaponTrailMaterial
        trail.setEnabled(false)
        return trail
    }

    createSwordParticles(handNode: TransformNode) {
        const emitter = new TransformNode('swordSmearEmitter', Renderer.scene)
        emitter.parent = handNode
        emitter.position = new Vector3(0, 2.8, 0)

        const ps = new GPUParticleSystem("charWeaponParticles", {
            capacity: 500
        }, Renderer.scene);

        ps.particleTexture = new Texture('images/gfx/flare-rect.png', Renderer.scene)

        ps.createBoxEmitter(
            Vector3.Zero(),
            Vector3.Zero(),
            new Vector3(-0.02, -1, -0.15),
            new Vector3(0.02, 1, 0.15)
        )

        ps.addSizeGradient(0, 0.075)
        ps.addSizeGradient(1, 0.04)

        ps.minLifeTime = 0.4
        ps.maxLifeTime = 0.6

        ps.emitRate = 300
        ps.blendMode = ParticleSystem.BLENDMODE_ONEONE

        ps.direction1 = BabylonUtils.getSymVector(-2)
        ps.direction2 = BabylonUtils.getSymVector(2)
        ps.minEmitPower = 0.2
        ps.maxEmitPower = 0.5
        ps.updateSpeed = 0.02

        // Gravity upwards
        ps.gravity = new Vector3(0, 2, 0)
        ps.addColorGradient(0, new Color4(0.8, 0.3, 0.1, 0.5))
        ps.addColorGradient(0.8, new Color4(0.1, 0.05, 0.01, 0.2))
        ps.addColorGradient(1, new Color4(0.1, 0.05, 0.01, 0.00))
        ps.emitter = emitter
        ps.start()
    }
}

/**
 * One mesh-type for each equipable item
 *
 * The mesh contains thin instances for each equipped item of this type
 */
export class MobEquipItemType {
    id: number
    name: string = ""
    mesh: Mesh | null = null
    count: number = 0

    instanceBuffer: Float32Array = new Float32Array(0)
    uvBuffer: Float32Array = new Float32Array(0)
    cbData: MobEquipItemData

    constructor(data: MobEquipItemData) {
        this.id = data.id
        this.cbData = data
    }

    async initializeMesh(parentNode: TransformNode, scene: Scene, fileName: string, material: PBRCustomMaterial | null, position: Vector3 = Vector3.Zero(), rotation: Vector3 = Vector3.Zero(), scale: Vector3 = Vector3.One()) {
        const result = await SceneLoader.ImportMeshAsync("", "/models/equip/", fileName, scene);
        const source = result.meshes[0] as Mesh

        source.position = position
        source.rotation = rotation
        source.scaling = scale

        this.mesh = Mesh.MergeMeshes([source], true)!
        if (material != null) {
            this.mesh.material = material
        }
        this.mesh.setEnabled(false)
        this.mesh.alwaysSelectAsActiveMesh = true
        this.mesh.parent = parentNode
    }

    async initializeMeshWeapon(parentNode: TransformNode, scene: Scene, fileName: string, material: PBRCustomMaterial | null, position: Vector3 = Vector3.Zero(), rotation: Vector3 = Vector3.Zero(), scale: Vector3 = Vector3.One()) {
        const result = await SceneLoader.ImportMeshAsync("", "/models/equip/", fileName, scene);
        const source = result.meshes[0].getChildMeshes()[0] as Mesh
        source.position = position
        source.rotation = rotation
        source.scaling = scale
        this.mesh = Mesh.MergeMeshes([source], true)!
        this.mesh.setEnabled(false)
        this.mesh.alwaysSelectAsActiveMesh = true
        this.mesh.parent = parentNode
        Lights.addShadowCaster(this.mesh)
    }

    /**
     * Update the count of thin instances for this item type
     * When count is zero, the mesh is disabled to save performance
     */
    updateCount(count: number) {
        this.count = count
        this.instanceBuffer = new Float32Array(16 * count)
        this.uvBuffer = new Float32Array(2 * count)

        if (this.mesh == null) {
            return
        }

        if (count === 0) {
            this.mesh.setEnabled(false)
        } else if (!this.mesh.isEnabled()) {
            this.mesh.alwaysSelectAsActiveMesh = true
            this.mesh.setEnabled(true)
        }
    }
}

/**
 * Every item type has a single mesh with thin instances for each equipped item
 *
 * On each frame, the instance buffer is updated with the position and rotation of each equipped item
 */
export const MobEquipManager = {
    itemTypes: new Map<number, MobEquipItemType>(),
    equippedItems: new Map<MobEquipItemType, Set<MobEquipItem>>(),

    async initialize(scene: Scene) {
        await MobWeaponsCbManager.initMelee(this.itemTypes, scene)
        await MobArmorsCbManager.initArmors(this.itemTypes, scene)
    },

    addEquippedItem(item: MobEquipItem) {
        if (!this.equippedItems.has(item.type)) {
            this.equippedItems.set(item.type, new Set())
        }
        this.equippedItems.get(item.type)!.add(item)
        item.type.updateCount(this.equippedItems.get(item.type)!.size)
    },

    removeEquippedItem(item: MobEquipItem) {
        if (item.weaponTrail) {
            item.weaponTrail.setEnabled(false)
        }
        this.equippedItems.get(item.type)?.delete(item)
        item.type.updateCount(this.equippedItems.get(item.type)!.size)
    },

    onFrame() {
        // For each item type, if at least one item is equipped, update the instance buffer
        this.equippedItems.forEach((items, type) => {
            if (type.count > 0) {
                let i = 0;

                // Every item has its position and rotation set in its onFrame() method
                items.forEach((item) => {
                    const posMatrix = Matrix.Translation(item.position.x, item.position.y, item.position.z);
                    const scaleMatrix = item.scaleMatrix;
                    scaleMatrix.multiply(Matrix.FromQuaternionToRef(item.quaternion, new Matrix()).multiply(posMatrix)).copyToArray(type.instanceBuffer, i * 16);

                    type.uvBuffer[i * 2] = item.matVector.x
                    type.uvBuffer[i * 2 + 1] = item.matVector.y
                    i++;
                })
                type.mesh!.thinInstanceSetBuffer("matrix", type.instanceBuffer);
                type.mesh!.thinInstanceSetBuffer("uvc", type.uvBuffer, 2)
            }
        })
    }
}

export interface EquipBearer {
    worldMatrix: Matrix
    rotationQuaternion: Quaternion

    getOwnerId(): number
    getWeaponTipPosition(): Vector3 | null
    getWeaponScale(): Vector3
    getMasterNode()
}

const BasicPlateMetalMaterials = [
    new Vector4(0.01, 0.76, 0.24, 0.99), // Iron
    new Vector4(0.26, 0.76, 0.49, 0.99), // Astracyte
    new Vector4(0.51, 0.76, 0.74, 0.99), // Agapyte
    new Vector4(0.76, 0.76, 0.99, 0.99), // Gold
    new Vector4(0.01, 0.51, 0.24, 0.74), // Redstone
    new Vector4(0.26, 0.51, 0.49, 0.74), // Darkstone
    new Vector4(0.51, 0.51, 0.74, 0.74), // Amethyst
    new Vector4(0.76, 0.51, 0.99, 0.74), // Mythril
    new Vector4(0.01, 0.26, 0.24, 0.49), // Rust iron
    new Vector4(0.26, 0.26, 0.49, 0.49), // Shadow iron
]
