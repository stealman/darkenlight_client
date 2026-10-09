import {
    Bone, Color4, GPUParticleSystem, Matrix,
    Mesh, ParticleSystem,
    Quaternion,
    Scene,
    SceneLoader, Texture, TrailMesh, TransformNode, Vector2, Vector3
} from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { WeaponsCbManager } from '@/babylon/item/codebook/weaponModelsCb'
import { ArmorsCbManager } from '@/babylon/item/codebook/armorsModelsCb'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { Renderer } from '@/babylon/scene/renderer'
import { Materials } from '@/babylon/materials'
import { Lights } from '@/babylon/scene/lights'
import { BabylonUtils } from '@/babylon/utils'

const WEAPON_TRAIL_START_DELAY = 150
const WEAPON_TRAIL_FADE_DURATION = 180

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
    weaponTrailStartDelayEnd: number = 0
    weaponTrailFadeInEnd: number = 0
    weaponTrailFadeEnd: number = 0
    weaponTrailTip: TransformNode | null = null
    powerStrikeTrailParticles: ParticleSystem | null = null
    powerStrikeTrailActive: boolean = false
    hasSwordParticles: boolean = false
    particleSystem: GPUParticleSystem | null = null

    private parentRotMatrix = new Matrix()
    private tmpOffset = new Vector3()

    constructor(type: EquipItemType, matIndex: number, parent: EquipBearer, bone: Bone, scale: Vector3 | null, rotation: Vector3 | null, position: Vector3 | null) {
        this.type = type
        this.parent = parent
        this.bone = bone
        this.scale = scale ? scale : Vector3.One()
        this.itemPosition = position ? position : Vector3.Zero()
        this.itemRotation = rotation ? Quaternion.FromEulerVector(rotation) : null
        if (this.type.cbData.weaponTipPosition) {
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
        this.parent.rotationQuaternion.multiplyToRef(this.boneRotationQuaternion, this.quaternion)

        // Apply specific item rotation
        if (this.itemRotation) {
            this.quaternion.multiplyToRef(this.itemRotation, this.quaternion)
        }

        // bone position do worldu parenta
        Vector3.TransformCoordinatesToRef(this.localPosition, this.parent.worldMatrix, this.position)

        // Apply specific item position offset (bez new Matrix)
        if (this.itemPosition) {
            Matrix.FromQuaternionToRef(this.parent.rotationQuaternion, this.parentRotMatrix)
            Vector3.TransformCoordinatesToRef(this.itemPosition, this.parentRotMatrix, this.tmpOffset)
            this.position.addInPlace(this.tmpOffset)
        }

        this.updateWeaponTrailFade()
    }

    createWeaponTrail(bone: Bone): TrailMesh {
        const tip = new TransformNode('weaponTip' + this.parent?.getOwnerId(), Renderer.scene)
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
        const trail = new TrailMesh('swordTrail', tip, Renderer.scene, 0.3, 60, false)
        trail.material = Materials.weaponTrailMaterial
        trail.setEnabled(false)
        return trail
    }

    setWeaponTrailEnabled(enabled: boolean, powerStrike: boolean = false) {
        if (enabled) {
            this.startWeaponTrail(powerStrike)
        } else {
            this.fadeWeaponTrail()
        }
    }

    stopWeaponTrailImmediately() {
        const trail = this.weaponTrail
        this.stopPowerStrikeTrailParticles()
        if (!trail) {
            return
        }

        this.weaponTrailStartDelayEnd = 0
        this.weaponTrailFadeInEnd = 0
        this.weaponTrailFadeEnd = 0
        trail.stop()
        trail.setEnabled(false)
        trail.visibility = 1
        trail.reset()
    }

    private startWeaponTrail(powerStrike: boolean) {
        const trail = this.weaponTrail
        if (!trail) {
            return
        }

        this.stopPowerStrikeTrailParticles()
        this.powerStrikeTrailActive = powerStrike
        trail.reset()
        trail.material = powerStrike ? Materials.powerStrikeWeaponTrailMaterial : Materials.weaponTrailMaterial
        this.weaponTrailStartDelayEnd = Date.now() + WEAPON_TRAIL_START_DELAY
        this.weaponTrailFadeInEnd = 0
        this.weaponTrailFadeEnd = 0
        trail.visibility = 0
        trail.setEnabled(true)
        trail.start()
    }

    private fadeWeaponTrail() {
        const trail = this.weaponTrail
        this.stopPowerStrikeTrailParticles()
        if (!trail || !trail.isEnabled() || this.weaponTrailFadeEnd > 0) {
            return
        }

        if (this.weaponTrailStartDelayEnd > 0 || this.weaponTrailFadeInEnd > 0) {
            this.stopWeaponTrailImmediately()
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
        if (this.weaponTrailStartDelayEnd > 0) {
            if (now < this.weaponTrailStartDelayEnd) {
                return
            }
            this.weaponTrailStartDelayEnd = 0
            this.weaponTrailFadeInEnd = now + WEAPON_TRAIL_FADE_DURATION
            if (this.powerStrikeTrailActive) {
                this.startPowerStrikeTrailParticles()
            }
        }

        if (this.weaponTrailFadeInEnd > 0) {
            const remaining = this.weaponTrailFadeInEnd - now
            if (remaining <= 0) {
                this.weaponTrailFadeInEnd = 0
                trail.visibility = 1
            } else {
                trail.visibility = 1 - remaining / WEAPON_TRAIL_FADE_DURATION
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

    private startPowerStrikeTrailParticles() {
        if (!this.weaponTrailTip || !Renderer.scene) {
            return
        }

        if (!this.powerStrikeTrailParticles) {
            const particles = new ParticleSystem(`powerStrikeTrailParticles_${this.parent.getOwnerId()}`, 96, Renderer.scene)
            particles.particleTexture = new Texture('images/gfx/dust.png', Renderer.scene)
            particles.emitter = this.weaponTrailTip
            particles.minEmitBox = Vector3.Zero()
            particles.maxEmitBox = Vector3.Zero()
            particles.direction1 = new Vector3(-1, -1, -1)
            particles.direction2 = new Vector3(1, 1, 1)
            particles.minEmitPower = 0.15
            particles.maxEmitPower = 0.3
            particles.minLifeTime = 0.45
            particles.maxLifeTime = 0.75
            particles.emitRate = 120
            particles.minSize = 0.2
            particles.maxSize = 0.32
            particles.minAngularSpeed = 0
            particles.maxAngularSpeed = 0
            particles.gravity = Vector3.Zero()
            particles.updateSpeed = 0.01
            particles.blendMode = ParticleSystem.BLENDMODE_STANDARD
            particles.addColorGradient(0, new Color4(0.72, 0.72, 0.72, 0.48))
            particles.addColorGradient(0.55, new Color4(0.55, 0.55, 0.55, 0.32))
            particles.addColorGradient(1, new Color4(0.35, 0.35, 0.35, 0))
            this.powerStrikeTrailParticles = particles
        }

        this.powerStrikeTrailParticles.start()
    }

    private stopPowerStrikeTrailParticles() {
        this.powerStrikeTrailActive = false
        this.powerStrikeTrailParticles?.stop()
    }

    disposePowerStrikeTrailParticles() {
        this.stopPowerStrikeTrailParticles()
        this.powerStrikeTrailParticles?.dispose()
        this.powerStrikeTrailParticles = null
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
    uvBufferDirty: boolean = true

    constructor(data: EquipCbItem) {
        this.id = data.id
        this.cbData = data
        this.ensureThinBuffers(this)
    }

    /** Loads a GLB source mesh for weapons and vertex-colour armour. */
    async initializeMeshGlb(parentNode: TransformNode, scene: Scene, fileName: string, material: PBRCustomMaterial | null, position: Vector3 = Vector3.Zero(), rotation: Vector3 = Vector3.Zero(), scale: Vector3 = Vector3.One(), castsShadows = true) {
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
        this.mesh.receiveShadows = true
        if (castsShadows) {
            Lights.addShadowCaster(this.mesh, true, false, true, true, (lightPosition, lightRangeSquared) => {
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
            })
        }
        Lights.registerDynamicLightMesh(this.mesh)
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
        this.uvBufferDirty = true

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
    equippedItems: new Map<EquipItemType, Set<EquipThinInstance>>(),

    _tmpPos: new Matrix(),
    _tmpRot: new Matrix(),
    _tmpWorld: new Matrix(),

    async initialize(scene: Scene) {
        await WeaponsCbManager.initMelee(this.itemTypes, scene)
        await ArmorsCbManager.initArmors(this.itemTypes, scene)
    },

    addEquippedItem(item: EquipItem) {
        this.addThinInstance(item)
    },

    addThinInstance(item: EquipThinInstance) {
        if (!this.equippedItems.has(item.type)) {
            this.equippedItems.set(item.type, new Set())
        }
        this.equippedItems.get(item.type)!.add(item)
        item.type.updateCount(this.equippedItems.get(item.type)!.size)
    },

    removeEquippedItem(item: EquipItem) {
        item.stopWeaponTrailImmediately()
        item.disposePowerStrikeTrailParticles()
        if (item.particleSystem) {
            item.particleSystem.stop()
            item.particleSystem.dispose()
        }
        this.removeThinInstance(item)
    },

    removeThinInstance(item: EquipThinInstance) {
        const items = this.equippedItems.get(item.type)
        items?.delete(item)
        item.type.updateCount(items?.size ?? 0)
    },

    onFrame() {
        this.equippedItems.forEach((items, type) => {
            if (type.count <= 0) return
            if (!type.mesh) return

            type.ensureThinBuffers(type)
            const updateUvc = type.uvBufferDirty

            let i = 0
            items.forEach(item => {
                Matrix.TranslationToRef(item.position.x, item.position.y, item.position.z, this._tmpPos)
                Matrix.FromQuaternionToRef(item.quaternion, this._tmpRot)

                this._tmpRot.multiplyToRef(this._tmpPos, this._tmpWorld)
                item.scaleMatrix.multiplyToRef(this._tmpWorld, this._tmpWorld)

                this._tmpWorld.copyToArray(type.instanceBuffer, i * 16)

                if (updateUvc) {
                    type.uvBuffer[i * 2] = item.matVector.x
                    type.uvBuffer[i * 2 + 1] = item.matVector.y
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
