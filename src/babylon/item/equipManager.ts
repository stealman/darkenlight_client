import {
    Bone, Color3, Color4, GPUParticleSystem, Matrix,
    Material, Mesh, ParticleSystem, PBRMaterial,
    Quaternion,
    Scene,
    SceneLoader, Texture, TrailMesh, TransformNode, Vector2, Vector3, VertexData
} from '@babylonjs/core'
import { WeaponsCbManager } from '@/babylon/item/codebook/weaponModelsCb'
import { ArmorsCbManager } from '@/babylon/item/codebook/armorsModelsCb'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { Materials } from '@/babylon/materials'
import { trackSpellGlowMesh, untrackSpellGlowMesh } from '@/babylon/gfx/spellGlowLayer'
import { Lights } from '@/babylon/scene/lights'
import { Settings } from '@/settings/settings'
import { BabylonUtils } from '@/babylon/utils'
import { ActiveMeshFreezer } from '@/babylon/scene/activeMeshFreezer'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { SunShadowProxyBatch } from '@/babylon/world/sunShadowProxyBatch'

const WEAPON_TRAIL_START_DELAY = 150
const WEAPON_TRAIL_FADE_DURATION = 180
const POWER_STRIKE_TRAIL_START_DELAY = 100
const POWER_STRIKE_TRAIL_FADE_IN = 80

export class EquipItem {
    parent: EquipBearer
    type: EquipItemType
    matVector: Vector2
    castsOutdoorShadow: boolean = false

    position: Vector3 = Vector3.Zero()
    quaternion: Quaternion = Quaternion.Identity()
    bone: Bone
    scale: Vector3
    itemRotation: Quaternion | null = null
    itemPosition: Vector3 | null = null
    localPosition: Vector3 = Vector3.Zero()
    boneRotationQuaternion: Quaternion = Quaternion.Identity()
    scaleMatrix: Matrix = Matrix.Identity()
    modelModifierMatrix: Matrix | null = null
    attachmentWorldMatrix: Matrix | null = null
    private attachmentLocalMatrix: Matrix | null = null
    private attachmentUsesJoint = true
    private attachmentBoneWorld = Matrix.Identity()

    weaponTrail: TrailMesh | null = null
    weaponTrailStartDelayEnd: number = 0
    weaponTrailFadeInEnd: number = 0
    weaponTrailFadeEnd: number = 0
    weaponTrailTip: TransformNode | null = null
    private powerStrikeTrailActive = false
    hasSwordParticles: boolean = false
    particleSystem: GPUParticleSystem | null = null

    private inverseRestMatrix = Matrix.Identity()
    private parentRotMatrix = new Matrix()
    private tmpOffset = new Vector3()

    constructor(type: EquipItemType, matIndex: number, parent: EquipBearer, bone: Bone, scale: Vector3 | null, rotation: Vector3 | null, position: Vector3 | null, modelModifier: EquipModelModifier | null = null) {
        if (!bone && typeof window !== 'undefined') {
            const message = `Chybí kost: ${parent.getEquipmentDebugLabel?.() ?? `objekt ${parent.getOwnerId()}`}; vybavení ${type.cbData.name} (ID ${type.id})`
            // Report at attachment time, before the anonymous per-frame error.
            // Keep this separate from the stack trace so it stays readable on touch devices.
            window.dispatchEvent(new CustomEvent('game:equipment-bone-error', { detail: { message } }))
            console.error(message)
        }
        this.type = type
        this.parent = parent
        this.bone = bone
        this.scale = scale ? scale : Vector3.One()
        this.itemPosition = position ? position : Vector3.Zero()
        this.itemRotation = rotation ? Quaternion.FromEulerVector(rotation) : null
        if (bone) {
            // Keep existing offsets in the model's rest-pose axes and world units.
            // Use the authored rest pose, including on reused animated clones.
            this.inverseRestMatrix.copyFrom(bone.getRestMatrix())
            for (let ancestor = bone.getParent(); ancestor; ancestor = ancestor.getParent()) {
                this.inverseRestMatrix.multiplyToRef(ancestor.getRestMatrix(), this.inverseRestMatrix)
            }
            this.inverseRestMatrix.invert()
        }
        const atlasMatIndex = type.cbData.resolveMaterialAtlasIndex(matIndex)
        this.matVector = this.getAtlasUvcOffsets(type.cbData.matCols, type.cbData.matRows, atlasMatIndex)
        this.scaleMatrix = Matrix.Scaling(this.scale.x, this.scale.y, this.scale.z)
        if (modelModifier) {
            this.modelModifierMatrix = Matrix.Compose(
                modelModifier.scale,
                Quaternion.FromEulerVector(modelModifier.rotation),
                modelModifier.position,
            )
        }
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
    attachUsingFullBoneTransform(local: Matrix, useJoint = true) {
        this.attachmentLocalMatrix = local.clone()
        this.attachmentWorldMatrix = Matrix.Identity()
        this.attachmentUsesJoint = useJoint
        this.updateAttachmentWorldMatrix()
    }

    updateAttachmentWorldMatrix() {
        if (!this.attachmentLocalMatrix || !this.attachmentWorldMatrix) return
        const joint = this.attachmentUsesJoint ? this.bone.getTransformNode() : null
        if (joint) {
            this.attachmentLocalMatrix.multiplyToRef(joint.computeWorldMatrix(true), this.attachmentWorldMatrix)
        } else {
            this.bone.getSkeleton().prepare()
            this.attachmentLocalMatrix.multiplyToRef(this.bone.getFinalMatrix(), this.attachmentBoneWorld)
            this.attachmentBoneWorld.multiplyToRef(this.parent.worldMatrix, this.attachmentWorldMatrix)
        }
        this.attachmentWorldMatrix.decompose(undefined, this.quaternion, this.position)
    }

    onFrame() {
        if (this.attachmentLocalMatrix) {
            this.updateAttachmentWorldMatrix()
            this.updateWeaponTrailFade()
            return
        }
        const m = this.bone.getFinalMatrix()
        m.getTranslationToRef(this.localPosition)
        Quaternion.FromRotationMatrixToRef(m, this.boneRotationQuaternion)

        // parentRot * boneRot
        this.parent.rotationQuaternion.multiplyToRef(this.boneRotationQuaternion, this.quaternion)

        // Apply specific item rotation
        if (this.itemRotation) {
            this.quaternion.multiplyToRef(this.itemRotation, this.quaternion)
        }

        // bone position do worldu parenta
        Vector3.TransformCoordinatesToRef(this.localPosition, this.parent.worldMatrix, this.position)

        // Carry the rest-pose offset with the bone, independently of item rotation.
        if (this.itemPosition && !this.itemPosition.equalsToFloats(0, 0, 0)) {
            Vector3.TransformNormalToRef(this.itemPosition, this.inverseRestMatrix, this.tmpOffset)
            Vector3.TransformNormalToRef(this.tmpOffset, m, this.tmpOffset)
            Matrix.FromQuaternionToRef(this.parent.rotationQuaternion, this.parentRotMatrix)
            Vector3.TransformNormalToRef(this.tmpOffset, this.parentRotMatrix, this.tmpOffset)
            this.position.addInPlace(this.tmpOffset)
        }

        this.updateWeaponTrailFade()
    }

    transformMeshPointToRef(local: Vector3, result: Vector3) {
        if (this.attachmentWorldMatrix) {
            Vector3.TransformCoordinatesToRef(local, this.attachmentWorldMatrix, result)
            return
        }
        result.copyFrom(local)
        if (this.modelModifierMatrix) Vector3.TransformCoordinatesToRef(result, this.modelModifierMatrix, result)
        result.multiplyInPlace(this.scale)
        result.rotateByQuaternionToRef(this.quaternion, result)
        result.addInPlace(this.position)
    }

    createWeaponTrail(bone: Bone): TrailMesh {
        const scene = this.parent.getMasterNode()!.getScene()
        const tip = new TransformNode('weaponTip' + this.parent?.getOwnerId(), scene)
        tip.attachToBone(bone, this.parent!.getMasterNode())
        this.weaponTrailTip = tip

        // Position the tip at the weapon tip position from the codebook data and scale it according to the weapon scale
        const p = this.type.cbData.weaponTipPosition!
        const s = this.parent?.getWeaponScale() ?? Vector3.One()

        tip.position.set(
            p.x * s.x,
            p.y * s.y,
            p.z * s.z
        )
        const trail = new TrailMesh('swordTrail', tip, scene, 0.3, 60, false)
        trail.material = Materials.weaponTrailMaterial
        trail.isPickable = false
        trail.setEnabled(false)
        return trail
    }

    setWeaponTrailEnabled(enabled: boolean, powerStrike: boolean = false) {
        if (enabled) {
            if (!this.weaponTrail && this.type.cbData.weaponTipPosition) {
                this.weaponTrail = this.createWeaponTrail(this.bone)
            }
            this.startWeaponTrail(powerStrike)
        } else {
            this.fadeWeaponTrail()
        }
    }

    stopWeaponTrailImmediately() {
        const trail = this.weaponTrail
        if (!trail) {
            return
        }

        if (this.powerStrikeTrailActive) untrackSpellGlowMesh(trail)
        this.powerStrikeTrailActive = false
        this.weaponTrailStartDelayEnd = 0
        this.weaponTrailFadeInEnd = 0
        this.weaponTrailFadeEnd = 0
        trail.stop()
        trail.setEnabled(false)
        trail.visibility = 1
        trail.reset()
    }

    disposeWeaponTrail() {
        this.stopWeaponTrailImmediately()
        this.weaponTrail?.dispose()
        this.weaponTrail = null
        this.weaponTrailTip?.dispose()
        this.weaponTrailTip = null
    }

    private startWeaponTrail(powerStrike: boolean) {
        const trail = this.weaponTrail
        if (!trail) {
            return
        }

        if (this.powerStrikeTrailActive) untrackSpellGlowMesh(trail)
        this.powerStrikeTrailActive = powerStrike
        trail.stop()
        trail.material = powerStrike ? Materials.powerStrikeWeaponTrailMaterial : Materials.weaponTrailMaterial
        trail.diameter = powerStrike ? 0.48 : 0.3
        this.weaponTrailStartDelayEnd = Date.now() + (powerStrike ? POWER_STRIKE_TRAIL_START_DELAY : WEAPON_TRAIL_START_DELAY)
        this.weaponTrailFadeInEnd = 0
        this.weaponTrailFadeEnd = 0
        trail.visibility = 0
        trail.setEnabled(false)
    }

    private fadeWeaponTrail() {
        const trail = this.weaponTrail
        if (!trail || this.weaponTrailFadeEnd > 0) {
            return
        }

        if (this.weaponTrailStartDelayEnd > 0 || this.weaponTrailFadeInEnd > 0) {
            this.stopWeaponTrailImmediately()
            return
        }

        if (!trail.isEnabled()) {
            return
        }

        trail.stop()
        this.weaponTrailFadeEnd = Date.now() + WEAPON_TRAIL_FADE_DURATION
    }

    private updateWeaponTrailFade() {
        const trail = this.weaponTrail
        if (!trail) {
            return
        }

        const now = Date.now()
        const fadeInDuration = this.powerStrikeTrailActive ? POWER_STRIKE_TRAIL_FADE_IN : WEAPON_TRAIL_FADE_DURATION
        if (this.weaponTrailStartDelayEnd > 0) {
            if (now < this.weaponTrailStartDelayEnd) {
                return
            }
            this.weaponTrailStartDelayEnd = 0
            this.weaponTrailFadeInEnd = now + fadeInDuration
            trail.reset()
            trail.setEnabled(true)
            trail.start()
            if (this.powerStrikeTrailActive) {
                trackSpellGlowMesh(trail)
            }
        }

        if (this.weaponTrailFadeInEnd > 0) {
            const remaining = this.weaponTrailFadeInEnd - now
            if (remaining <= 0) {
                this.weaponTrailFadeInEnd = 0
                if (trail.visibility <= 0) {
                    ActiveMeshFreezer.invalidate()
                }
                trail.visibility = 1
            } else {
                const visibility = 1 - remaining / fadeInDuration
                if (trail.visibility <= 0 && visibility > 0) {
                    ActiveMeshFreezer.invalidate()
                }
                trail.visibility = visibility
            }
            return
        }

        if (this.weaponTrailFadeEnd === 0) {
            return
        }

        const remaining = this.weaponTrailFadeEnd - now
        if (remaining <= 0) {
            this.stopWeaponTrailImmediately()
            return
        }

        trail.visibility = remaining / WEAPON_TRAIL_FADE_DURATION
        trail.update()
    }

    createSwordParticles(handNode: TransformNode) {
        const scene = handNode.getScene()
        const emitter = new TransformNode('swordSmearEmitter', scene)
        emitter.parent = handNode
        emitter.position = new Vector3(0, 2.8, 0)

        const ps = new GPUParticleSystem("charWeaponParticles", {
            capacity: 350
        }, scene);

        ps.particleTexture = new Texture('images/gfx/flare-rect.png', scene)

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
        ps.updateSpeed = 0.04

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

export interface EquipThinInstance {
    type: EquipItemType
    matVector: Vector2
    position: Vector3
    quaternion: Quaternion
    scaleMatrix: Matrix
    modelModifierMatrix?: Matrix | null
    attachmentWorldMatrix?: Matrix | null
    updateAttachmentWorldMatrix?(): void
    castsOutdoorShadow?: boolean
}

export interface EquipModelModifier {
    position: Vector3
    rotation: Vector3
    scale: Vector3
}

export class EquipBatchMesh extends Mesh {
    override isReady(completeCheck = false, forceInstanceSupport = false): boolean {
        // An empty batch has no draw call. The scene-wide readiness check
        // would otherwise compile a non-instanced variant that we never draw.
        if (completeCheck && !forceInstanceSupport && !this.isEnabled()) return true
        return super.isReady(completeCheck, forceInstanceSupport)
    }
}

/** The shared thin-instance batch for one equipment model. */
export class EquipItemType {
    id: number
    name: string = ""
    mesh: Mesh | null = null
    count: number = 0

    instanceBuffer: Float32Array = new Float32Array(0)
    uvBuffer: Float32Array = new Float32Array(0)
    cbData: EquipCbItem
    _thinReady: boolean = false
    uvBufferDirty: boolean = true
    castsShadows: boolean = false
    sunShadowEnabled: boolean = false
    sunShadowProxyTransform: Matrix | null = null

    constructor(data: EquipCbItem, readonly loadMesh?: () => Promise<void>) {
        this.id = data.id
        this.cbData = data
        this.ensureThinBuffers(this)
    }

    /** Loads a GLB source mesh for weapons and vertex-colour armour. */
    async initializeMeshGlb(parentNode: TransformNode, scene: Scene, fileName: string, material: PBRMaterial | null, position: Vector3 = Vector3.Zero(), rotation: Vector3 = Vector3.Zero(), scale: Vector3 = Vector3.One(), castsShadows = true) {
        const result = await SceneLoader.ImportMeshAsync('', '', modelAssetUrl('/models/equip/' + fileName, scene), scene)
        if (scene.isDisposed) return
        const source = result.meshes[0].getChildMeshes()[0] as Mesh
        source.position = position
        source.rotation = rotation
        source.scaling = scale

        this.mesh = Mesh.MergeMeshes([source], true, undefined, new EquipBatchMesh(source.name + '_merged', scene))!
        if (material != null) {
            this.mesh.material = material
        }

        this.mesh.setEnabled(false)
        this.mesh.alwaysSelectAsActiveMesh = true
        this.mesh.parent = parentNode
        this.mesh.receiveShadows = true
        this.castsShadows = castsShadows
        this.sunShadowEnabled = castsShadows && !Settings.isDetailLevelMedium()
        if (castsShadows) {
            Lights.addShadowCaster(this.mesh, true, false, false, true, (lightPosition, lightRangeSquared) => {
                // Medium enables the shared batch outdoors when it contains
                // the local player's weapon or shield.
                if (Settings.isDetailLevelMedium() && !Lights.indoor && !this.hasLocalPlayerShadowEquipment()) {
                    return false
                }
                const items = EquipManager.equippedItems.get(this)
                if (items == null) {
                    return false
                }
                for (const item of items) {
                    const dx = item.position.x - lightPosition.x
                    const dy = item.position.y - lightPosition.y
                    const dz = item.position.z - lightPosition.z
                    if (((dx * dx) + (dy * dy) + (dz * dz)) <= lightRangeSquared) {
                        return true
                    }
                }
                return false
            }, true, !Settings.isDetailLevelMedium())
        }
        Lights.registerDynamicLightMesh(this.mesh)
    }

    hasLocalPlayerShadowEquipment(): boolean {
        const items = EquipManager.equippedItems.get(this)
        if (items) {
            for (const item of items) {
                if (item.castsOutdoorShadow) return true
            }
        }
        return false
    }

    updateOutdoorShadows() {
        if (!Settings.isDetailLevelMedium() || !this.castsShadows || !this.mesh || this.sunShadowProxyTransform) return
        const enabled = this.hasLocalPlayerShadowEquipment()
        if (enabled === this.sunShadowEnabled) return
        if (enabled) {
            Lights.shadow.addShadowCaster(this.mesh)
        } else {
            Lights.shadow.removeShadowCaster(this.mesh)
        }
        this.sunShadowEnabled = enabled
    }

    ensureThinBuffers(type: EquipItemType) {
        if (!type.mesh) return
        if (type._thinReady) return

        if (type.instanceBuffer.length === 0) {
            type.instanceBuffer = new Float32Array(8 * 16)
            type.uvBuffer = new Float32Array(8 * 2)
        }
        type.mesh.thinInstanceSetBuffer("matrix", type.instanceBuffer, 16, false) // dynamic
        type.mesh.thinInstanceRegisterAttribute("uvc", 2)
        type.mesh.thinInstanceSetBuffer("uvc", type.uvBuffer, 2, false) // dynamic
        type.mesh.thinInstanceCount = type.count

        type._thinReady = true
    }

    /**
     * Update the count of thin instances for this item type
     * When count is zero, the mesh is disabled to save performance
     */
    updateCount(count: number) {
        if (this.count === count) {
            // Membership may still have changed (one item replaced another),
            // but the existing GPU buffers already have the right capacity.
            this.uvBufferDirty = true
            return
        }
        this.count = count
        const capacity = this.instanceBuffer.length / 16
        if (count > capacity) {
            // Retain spare capacity when actors leave, including an empty
            // batch. Only growing the high-water mark replaces GPU buffers.
            const nextCapacity = Math.max(8, count, capacity * 2)
            this.instanceBuffer = new Float32Array(16 * nextCapacity)
            this.uvBuffer = new Float32Array(2 * nextCapacity)
            this._thinReady = false
        }
        this.uvBufferDirty = true

        if (!this.mesh) return

        if (count === 0) {
            this.mesh.thinInstanceCount = 0
            this.mesh.setEnabled(false)
            return
        }

        this.mesh.alwaysSelectAsActiveMesh = true
        this.mesh.setEnabled(true)

        this.ensureThinBuffers(this)
        // Binding a capacity-sized matrix buffer sets Babylon's instance
        // count to its capacity. Render only the occupied slots.
        this.mesh.thinInstanceCount = count
    }
}

/**
 * Every item type has a single mesh with thin instances for each equipped item
 *
 * On each frame, the instance buffer is updated with the position and rotation of each equipped item
 */
export const EquipManager = {
    itemTypes: new Map<number, EquipItemType>(),
    pendingModels: new Map<EquipItemType, Promise<void>>(),
    equippedItems: new Map<EquipItemType, Set<EquipThinInstance>>(),
    dirtyItemTypes: new Set<EquipItemType>(),
    headSunShadows: null as SunShadowProxyBatch | null,

    _tmpPos: new Matrix(),
    _tmpRot: new Matrix(),
    _tmpWorld: new Matrix(),
    _tmpModel: new Matrix(),
    _tmpHeadShadow: new Matrix(),

    async initialize(scene: Scene) {
        // Equipment and its source meshes belong to one scene. A new session
        // must not update attachments whose skeleton textures were disposed.
        this.equippedItems.clear()
        this.itemTypes = new Map()
        this.pendingModels = new Map()
        this.dirtyItemTypes.clear()
        if (Settings.isShadowsEnabled()) {
            const mesh = new Mesh('humanHeadSunShadow', scene)
            // The icosahedron's extent is about 85% of its circumradius.
            VertexData.CreateIcoSphere({radius: 0.588, subdivisions: 1, flat: false}).applyToMesh(mesh)
            const batch = this.headSunShadows = new SunShadowProxyBatch(mesh)
            mesh.onDisposeObservable.addOnce(() => {
                if (this.headSunShadows === batch) this.headSunShadows = null
            })
        } else {
            this.headSunShadows = null
        }
        WeaponsCbManager.registerModels(this.itemTypes, scene)
        await this.initializeArmors(scene)
    },

    async initializeArmors(scene: Scene) {
        await ArmorsCbManager.initArmors(this.itemTypes, scene)
    },

    getItemType(modelId: number): EquipItemType | undefined {
        return this.itemTypes.get(modelId)
    },

    async preloadWeapons() {
        // Nearby models may already be loading. Finish the remaining work
        // behind the overlay so walking into a settlement doesn't start it.
        const types = this.itemTypes.values()
        await Promise.all(Array.from({length: 4}, async () => {
            for (const type of types) {
                if (type.loadMesh) await this.requestModel(type.id)
            }
        }))
    },

    requestModel(modelId: number): Promise<void> | undefined {
        const type = this.itemTypes.get(modelId)
        if (!type?.loadMesh) return
        const pending = this.pendingModels
        const existing = pending.get(type)
        if (existing || type.mesh) return existing

        const request = type.loadMesh().then(() => {
            if (this.pendingModels !== pending || !type.mesh || type.mesh.isDisposed()) return
            if (this.equippedItems.get(type)?.size) {
                this.dirtyItemTypes.add(type)
                type.updateOutdoorShadows()
            }
        }).catch(error => {
            if (this.pendingModels === pending) console.warn(`Could not load equipment model ${modelId}`, error)
        }).finally(() => pending.delete(type))
        pending.set(type, request)
        return request
    },

    addEquippedItem(item: EquipItem) {
        this.addThinInstance(item)
    },

    addThinInstance(item: EquipThinInstance) {
        if (!this.equippedItems.has(item.type)) {
            this.equippedItems.set(item.type, new Set())
        }
        const items = this.equippedItems.get(item.type)!
        const previousSize = items.size
        items.add(item)
        if (items.size !== previousSize) {
            this.dirtyItemTypes.add(item.type)
            item.type.updateOutdoorShadows()
            if (previousSize === 0 && !item.type.mesh) void this.requestModel(item.type.id)
        }
    },

    removeEquippedItem(item: EquipItem) {
        item.stopWeaponTrailImmediately()
        if (item.particleSystem) {
            item.particleSystem.stop()
            item.particleSystem.dispose()
        }
        this.removeThinInstance(item)
    },

    removeThinInstance(item: EquipThinInstance) {
        const items = this.equippedItems.get(item.type)
        if (items?.delete(item)) {
            this.dirtyItemTypes.add(item.type)
            item.type.updateOutdoorShadows()
        }
    },

    onFrame() {
        // Several characters can enter or leave the viewport in one visibility
        // pass. Resize each affected thin-instance buffer only once per frame.
        this.dirtyItemTypes.forEach(type => {
            if (type.mesh) type.updateCount(this.equippedItems.get(type)?.size ?? 0)
        })
        this.dirtyItemTypes.clear()

        const headShadows = this.headSunShadows
        const collectHeadShadows = headShadows && !Lights.indoor && Lights.shadow.getDarkness() < 1
        const localHeadOnly = Settings.isDetailLevelMedium()
        headShadows?.clear()
        this.equippedItems.forEach((items, type) => {
            if (type.count <= 0) return
            if (!type.mesh) return

            type.ensureThinBuffers(type)
            const updateUvc = type.uvBufferDirty
            const proxyTransform = collectHeadShadows ? type.sunShadowProxyTransform : null

            let i = 0
            items.forEach(item => {
                if (item.attachmentWorldMatrix) {
                    item.updateAttachmentWorldMatrix?.()
                    item.attachmentWorldMatrix.copyToArray(type.instanceBuffer, i * 16)
                } else {
                    Matrix.TranslationToRef(item.position.x, item.position.y, item.position.z, this._tmpPos)
                    Matrix.FromQuaternionToRef(item.quaternion, this._tmpRot)

                    this._tmpRot.multiplyToRef(this._tmpPos, this._tmpWorld)
                    if (item.modelModifierMatrix) {
                        item.modelModifierMatrix.multiplyToRef(item.scaleMatrix, this._tmpModel)
                        this._tmpModel.multiplyToRef(this._tmpWorld, this._tmpWorld)
                    } else {
                        item.scaleMatrix.multiplyToRef(this._tmpWorld, this._tmpWorld)
                    }

                    this._tmpWorld.copyToArray(type.instanceBuffer, i * 16)
                }

                if (updateUvc) {
                    type.uvBuffer[i * 2] = item.matVector.x
                    type.uvBuffer[i * 2 + 1] = item.matVector.y
                }
                if (proxyTransform && (!localHeadOnly || item.castsOutdoorShadow)) {
                    proxyTransform.multiplyToRef(item.attachmentWorldMatrix ?? this._tmpWorld, this._tmpHeadShadow)
                    headShadows!.add(this._tmpHeadShadow)
                }
                i++
            })

            // důležitý když máš buffery větší než aktuální počet
            type.mesh.thinInstanceCount = i
            type.mesh.thinInstanceBufferUpdated("matrix")
            if (updateUvc) {
                type.mesh.thinInstanceBufferUpdated("uvc")
                type.uvBufferDirty = false
            }
        })
        headShadows?.flush()
    },

    async warmUpShaders(appearanceTypes: readonly EquipItemType[] = []) {
        const batches = new Map<Material, EquipItemType[]>()
        for (const type of [...this.itemTypes.values(), ...appearanceTypes]) {
            const mesh = type.mesh
            if (mesh?.material == null || mesh.isDisposed()) continue
            let batch = batches.get(mesh.material)
            if (!batch) batches.set(mesh.material, batch = [])
            batch.push(type)
        }

        // Babylon changes shader hot-swapping state on the material during
        // compilation. Only warm up distinct materials at the same time.
        const pending = batches.values()
        const concurrency = Math.min(batches.size, Lights.supportsParallelShaderCompilation() ? 4 : 1)
        await Promise.all(Array.from({length: concurrency}, async () => {
            for (const batch of pending) {
                for (const type of batch) {
                    const mesh = type.mesh!
                    const count = mesh.thinInstanceCount
                    try {
                        type.ensureThinBuffers(type)
                        // Babylon selects THIN_INSTANCES from the actual count,
                        // independently of the forceCompilation useInstances flag.
                        if (count === 0) mesh.thinInstanceCount = 1
                        await mesh.material!.forceCompilationAsync(mesh, {useInstances: true})
                    } catch (error) {
                        console.warn(`Equipment shader warm-up failed for model ${type.id}`, error)
                    } finally {
                        mesh.thinInstanceCount = count
                    }
                }
            }
        }))
    }
}

export interface EquipBearer {
    getEquipmentDebugLabel?(): string
    worldMatrix: Matrix
    rotationQuaternion: Quaternion
    getOwnerId(): number
    getWeaponTipPosition(): Vector3 | null
    getWeaponScale(): Vector3
    getMasterNode()
}
