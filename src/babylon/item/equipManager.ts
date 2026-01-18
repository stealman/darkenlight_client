import {
    Bone, Color4, GPUParticleSystem, Matrix,
    Mesh, ParticleSystem,
    Quaternion,
    Scene,
    SceneLoader, Texture, TrailMesh, TransformNode, Vector2, Vector3
} from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { WeaponsCbManager } from '@/babylon/item/codebook/weaponsCb'
import { ArmorsCbManager } from '@/babylon/item/codebook/armorsCb'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { Renderer } from '@/babylon/scene/renderer'
import { Materials } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { BabylonUtils } from '@/babylon/utils'

export class EquipItem {
    parent: EquipBearer
    type: EquipItemType
    matVector: Vector2

    position: Vector3 = Vector3.Zero()
    quaternion: Quaternion = Quaternion.Identity()
    bone: Bone
    scale: Vector3
    itemRotation: Quaternion | null = null
    itemPosition: Vector3 | null = null
    localPosition: Vector3 = Vector3.Zero()
    boneRotationQuaternion: Quaternion = Quaternion.Identity()
    scaleMatrix: Matrix = Matrix.Identity()

    weaponTrail: TrailMesh | null = null
    hasSwordParticles: boolean = false
    particleSystem: GPUParticleSystem | null = null

    private parentRotMatrix = new Matrix()
    private tmpOffset = new Vector3()

    constructor(type: EquipItemType, matIndex: number, parent: EquipBearer, bone: Bone, scale: Vector3 | null, rotation: Vector3 | null, position: Vector3 | null, addWeaponTrail: boolean = false) {
        this.type = type
        this.parent = parent
        this.bone = bone
        this.scale = scale ? scale : Vector3.One()
        this.itemPosition = position ? position : Vector3.Zero()
        this.itemRotation = rotation ? Quaternion.FromEulerVector(rotation) : null
        if (addWeaponTrail) {
            this.weaponTrail = this.createWeaponTrail(this.bone)
        }
        this.matVector = this.getAtlasUvcOffsets(type.cbData.matCols, type.cbData.matRows, matIndex)
        this.scaleMatrix = Matrix.Scaling(this.scale.x, this.scale.y, this.scale.z)
    }

    getAtlasUvcOffsets = (matCols: number, matsRows: number, matIndex: number, pad = 0) => {
        const tileX = matIndex % matCols
        const tileY = Math.floor(matIndex / matCols)

        const matCol = (tileX) + pad
        const matRow = (matsRows) - (tileY + (1 - pad))
        return new Vector2(matCol, matRow)
    }

    /**
     * Update world position and rotation from the bone each frame
     */
    onFrame() {
        const m = this.bone.getFinalMatrix()
        m.getTranslationToRef(this.localPosition)
        Quaternion.FromRotationMatrixToRef(m, this.boneRotationQuaternion)

        // parentRot * boneRot
        this.quaternion = this.parent.rotationQuaternion.multiply(this.boneRotationQuaternion)

        // Apply specific item rotation
        if (this.itemRotation) {
            this.quaternion = this.quaternion.multiply(this.itemRotation)
        }

        // bone position do worldu parenta
        Vector3.TransformCoordinatesToRef(this.localPosition, this.parent.worldMatrix, this.position)

        // Apply specific item position offset (bez new Matrix)
        if (this.itemPosition) {
            Matrix.FromQuaternionToRef(this.parent.rotationQuaternion, this.parentRotMatrix)
            Vector3.TransformCoordinatesToRef(this.itemPosition, this.parentRotMatrix, this.tmpOffset)
            this.position.addInPlace(this.tmpOffset)
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
            capacity: 350
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

        ps.minLifeTime = 0.5
        ps.maxLifeTime = 0.75

        ps.emitRate = 200
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
        this.particleSystem = ps
        this.hasSwordParticles = true
    }
}

/**
 * One mesh-type for each equipable item
 * The mesh contains thin instances for each equipped item of this type
 */
export class EquipItemType {
    id: number
    name: string = ""
    mesh: Mesh | null = null
    count: number = 0

    instanceBuffer: Float32Array = new Float32Array(0)
    uvBuffer: Float32Array = new Float32Array(0)
    cbData: EquipCbItem
    _thinReady: boolean = false

    constructor(data: EquipCbItem) {
        this.id = data.id
        this.cbData = data
        this.ensureThinBuffers(this)
    }

    /**
     * Armor uses .babylon files
     */
    async initializeMeshArmor(parentNode: TransformNode, scene: Scene, fileName: string, material: PBRCustomMaterial | null, position: Vector3 = Vector3.Zero(), rotation: Vector3 = Vector3.Zero(), scale: Vector3 = Vector3.One()) {
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

    /**
     * Weapon uses .glb files
     */
    async initializeMeshWeapon(parentNode: TransformNode, scene: Scene, fileName: string, material: PBRCustomMaterial | null, position: Vector3 = Vector3.Zero(), rotation: Vector3 = Vector3.Zero(), scale: Vector3 = Vector3.One()) {
        const result = await SceneLoader.ImportMeshAsync("", "/models/equip/", fileName, scene);
        const source = result.meshes[0].getChildMeshes()[0] as Mesh
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
        Lights.addShadowCaster(this.mesh)
    }

    ensureThinBuffers(type: EquipItemType) {
        if (!type.mesh) return
        if (type._thinReady) return

        type.mesh.thinInstanceSetBuffer("matrix", type.instanceBuffer, 16, false) // dynamic
        type.mesh.thinInstanceRegisterAttribute("uvc", 2)
        type.mesh.thinInstanceSetBuffer("uvc", type.uvBuffer, 2, false) // dynamic

        type._thinReady = true
    }

    /**
     * Update the count of thin instances for this item type
     * When count is zero, the mesh is disabled to save performance
     */
    updateCount(count: number) {
        this.count = count
        this.instanceBuffer = new Float32Array(16 * count)
        this.uvBuffer = new Float32Array(2 * count)

        if (!this.mesh) return

        if (count === 0) {
            this.mesh.setEnabled(false)
            return
        }

        this.mesh.alwaysSelectAsActiveMesh = true
        this.mesh.setEnabled(true)

        // důležité: buffer se změnil => znovu setnout
        this._thinReady = false
        this.ensureThinBuffers(this)
    }
}

/**
 * Every item type has a single mesh with thin instances for each equipped item
 *
 * On each frame, the instance buffer is updated with the position and rotation of each equipped item
 */
export const EquipManager = {
    itemTypes: new Map<number, EquipItemType>(),
    equippedItems: new Map<EquipItemType, Set<EquipItem>>(),

    _tmpPos: new Matrix(),
    _tmpRot: new Matrix(),
    _tmpWorld: new Matrix(),

    async initialize(scene: Scene) {
        await WeaponsCbManager.initMelee(this.itemTypes, scene)
        await ArmorsCbManager.initArmors(this.itemTypes, scene)
    },

    addEquippedItem(item: EquipItem) {
        if (!this.equippedItems.has(item.type)) {
            this.equippedItems.set(item.type, new Set())
        }
        this.equippedItems.get(item.type)!.add(item)
        item.type.updateCount(this.equippedItems.get(item.type)!.size)
    },

    removeEquippedItem(item: EquipItem) {
        if (item.weaponTrail) {
            item.weaponTrail.setEnabled(false)
        }
        if (item.particleSystem) {
            item.particleSystem.stop()
            item.particleSystem.dispose()
        }
        this.equippedItems.get(item.type)?.delete(item)
        item.type.updateCount(this.equippedItems.get(item.type)!.size)
    },

    onFrame() {
        this.equippedItems.forEach((items, type) => {
            if (type.count <= 0) return
            if (!type.mesh) return

            type.ensureThinBuffers(type)

            let i = 0
            items.forEach(item => {
                Matrix.TranslationToRef(item.position.x, item.position.y, item.position.z, this._tmpPos)
                Matrix.FromQuaternionToRef(item.quaternion, this._tmpRot)

                this._tmpRot.multiplyToRef(this._tmpPos, this._tmpWorld)
                item.scaleMatrix.multiplyToRef(this._tmpWorld, this._tmpWorld)

                this._tmpWorld.copyToArray(type.instanceBuffer, i * 16)

                type.uvBuffer[i * 2] = item.matVector.x
                type.uvBuffer[i * 2 + 1] = item.matVector.y
                i++
            })

            // důležitý když máš buffery větší než aktuální počet
            type.mesh.thinInstanceCount = i
            type.mesh.thinInstanceBufferUpdated("matrix")
            type.mesh.thinInstanceBufferUpdated("uvc")
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
