import {
    AbstractMesh,
    AnimationGroup, Bone, Matrix,
    Mesh, Quaternion,
    Skeleton, Sound, TransformNode, Vector3,
} from '@babylonjs/core'
import { Monster } from '@/babylon/monsters/monster'
import { MonsterLoader } from '@/babylon/monsters/monsterLoader'
import { MonsterCodebook, MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { MeshAnimation } from '@/babylon/animations/animation'
import { MonsterTemplate } from '@/babylon/monsters/codebook/monsterTemplates'
import { EquipBearer, EquipItem, EquipManager } from '@/babylon/item/equipManager'
import { Utils } from '@/utils/utils'
import { Renderer } from '@/babylon/scene/renderer'
import { WorldDataManager } from '@/data/worldDataManager'
import { ActiveMeshFreezer } from '@/babylon/scene/activeMeshFreezer'
import { AudioManager, FootStepSpeeds, FootStepTypes } from '@/babylon/audio/audioManager'
import { AudioUtils } from '@/babylon/audio/audioUtils'
import { WATER_BLOCK_TYPE } from '@/babylon/world/terrainManager'
import { TerrainManager } from '@/babylon/world/terrainManager'
import { Settings } from '@/settings/settings'
import { Lights } from '@/babylon/scene/lights'
import { MyPlayer } from '@/data/myPlayer'
import { GfxManager } from '@/babylon/gfx/gfxManager'

export class MonsterModel implements EquipBearer {
    private footStepSounds = new Map<string, Sound>()
    parent: Monster
    type: MonsterType
    initialized: boolean = false
    viewRequested: boolean = false
    preparingFirstView: boolean = false
    selected: boolean = false
    selectedMaterialApplied: boolean = false
    node: Mesh
    mesh: Mesh
    nameTextNode: TransformNode

    template: MonsterTemplate

    worldMatrix: Matrix = Matrix.Identity()
    rotationQuaternion: Quaternion = Quaternion.Identity()
    modelRotation: number = 0
    modelYAngleOffset: number = Math.PI * 1 / 4

    skeleton: Skeleton
    lhandNode: TransformNode = new TransformNode("lhandNode")
    animation: AnimationGroup

    idleAnim: MeshAnimation | undefined
    walkAnim: MeshAnimation | undefined
    attackAnims: MeshAnimation[] = []
    attackBowAnim: MeshAnimation | undefined
    deadAnim: MeshAnimation | undefined
    activeAnims: Set<MeshAnimation>
    pendingAttackSoundAnim: MeshAnimation | null = null
    idleAnimationFrozen: boolean = false

    weaponEquipItem: EquipItem | null = null
    equipSet: Set<EquipItem> = new Set()

    chestBone: Bone
    rhandBone: Bone
    lhandBone: Bone
    headBone: Bone

    isDying: boolean = false
    fadeOutTimer: number = 0
    fadeOutStarted: boolean = false

    constructor(monsterType: MonsterType, parent: Monster) {
        this.parent = parent
        this.type = monsterType
        this.activeAnims = new Set<MeshAnimation>()
        this.nameTextNode = new TransformNode("nameTextNode")
    }

    /**
     * Initialize the model - for monsters out of view this is done only when they enter the view for the first time
     */
    initializeModel() {
        this.template = MonsterLoader.getMonsterClone(this.type)
        this.template.monster = this.parent
        this.node = this.template.node
        this.mesh = this.template.mesh
        this.skeleton = this.template.skeleton
        this.animation = this.template.animation

        MonsterCodebook.initializeEquipAndAnimations(this)

        this.nameTextNode.parent = this.node
        this.nameTextNode.position.y = this.parent.getModelHeight() / this.template.scale.y
        this.initialized = true

        this.node.position.x = this.parent.pos.x
        this.node.position.z = this.parent.pos.z
        this.parent.nameDisplayTime = Date.now() + 3000
    }

    assignRhand(type: number, matIndex: number, scale = Vector3.One(), rotation: Vector3 | null, position: Vector3 | null) {
        this.weaponEquipItem = new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.rhandBone, scale, rotation, position)
        this.addEquippedItem(this.weaponEquipItem)
    }

    assignChest(type: number, matIndex: number, scale = Vector3.One(), rotation: Vector3 | null, position: Vector3 | null) {
        this.addEquippedItem(new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.chestBone, scale, rotation, position))
    }

    assignHelmet(type: number, matIndex: number, scale = Vector3.One(), rotation: Vector3 | null, position: Vector3 | null) {
        this.addEquippedItem(new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.headBone, scale, rotation, position))
    }

    addEquippedItem(item: EquipItem) {
        this.equipSet.add(item)
        EquipManager.addEquippedItem(item)
    }

    onFrame(timeRate: number) {
        if (!this.isActive()) return

        if (this.selected || this.type.id === 1201) this.refreshSelectedMaterial()
        this.resolveMovement(timeRate)
        this.worldMatrix = this.mesh.getWorldMatrix()
        this.worldMatrix.decompose(undefined, this.rotationQuaternion, undefined)

        this.equipSet.forEach(item => {
            item.onFrame()
        })
    }

    onAnimFrame() {
        if (!this.isActive()) return

        if (this.activeAnims.size > 0) {
            this.activeAnims.forEach(anim => {
                anim.onAnimFrame()
                if (anim === this.pendingAttackSoundAnim) {
                    const range = anim.toFrame - anim.fromFrame
                    const progress = anim.running && range > 0 ? anim.actualFrame / range : 1
                    if (progress >= this.type.attackSoundProgress) {
                        AudioManager.playMonsterAttack(this.type.attackSoundType, this.parent.pos)
                        this.pendingAttackSoundAnim = null
                    }
                }
                if (!anim.running) {
                    this.activeAnims.delete(anim)
                }
            })
        }

        // Dying fade out
        if (this.isDying && this.fadeOutTimer > 0 && new Date().getTime() > this.fadeOutTimer) {
            if (!this.fadeOutStarted) {
                this.createDyingParticleEffect()
                this.fadeOutStarted = true
            }
            // burrow into the ground while fading out
            this.node.position.y -= 0.003 * Renderer.animationSpeedRatio
        }
    }

    resolveMovement(timeRate: number) {
        // Clamp the blend so long frames cannot overshoot the authoritative position.
        const positionBlend = Math.min(1, 15 * timeRate)
        if (!this.isDying) {
            this.node.position.x += (this.parent.pos.x - this.node.position.x) * positionBlend
            this.node.position.z += (this.parent.pos.z - this.node.position.z) * positionBlend

            this.resolveModelYpos(timeRate)
            this.resolveModelRotation(timeRate)
        }

        // Actualize the world matrix immediately for equpped items to move with the model correctly
        this.mesh.computeWorldMatrix(true)
    }

    /**
     * Approximate model Y position to the player Y position
     */
    resolveModelYpos(timeRate: number) {
        this.parent.pos.y += (this.parent.logicYpos - this.parent.pos.y) * Math.min(1, 15 * timeRate)
        this.node.position.y = this.parent.pos.y
    }

    /**
     * Approximate model rotation to the move angle
     */
    resolveModelRotation(timeRate: number) {
        if (this.parent.lookAngle == null) {
            return
        }

        const myAngle = this.node.rotation.y - this.modelYAngleOffset

        let angleDifference = this.parent.lookAngle - myAngle;
        const rotationSpeed = this.parent.rotationSpeed * timeRate;
        if (angleDifference > Math.PI) {
            angleDifference -= 2 * Math.PI;
        } else if (angleDifference < -Math.PI) {
            angleDifference += 2 * Math.PI;
        }

        if (Math.abs(angleDifference) < rotationSpeed) {
            this.node.rotation.y = this.parent.lookAngle + this.modelYAngleOffset;
        } else {
            this.node.rotation.y += Math.sign(angleDifference) * rotationSpeed;
        }
        this.modelRotation = this.node.rotation.y;
    }

    doAttackAnimation() {
        if (!this.isActive()) return
        this.idleAnimationFrozen = false
        const baseAnimSpeed = 1000

        const possibleAnims = []
        if (!this.parent.isWeaponRanged()) {
            possibleAnims.push(...this.attackAnims)
        } else {
            possibleAnims.push(this.attackBowAnim)
        }

        const anim = possibleAnims[Utils.rollDice(possibleAnims.length, true)]
        if (anim == null) {
            return
        }
        this.transitionToAnimation(anim, true, false, baseAnimSpeed / this.parent.attackAnimationTime)
        this.pendingAttackSoundAnim = this.type.attackSoundType == null ? null : anim
        this.setWeaponTrailEnabled(true)
    }

    updateFootsteps(moving: boolean) {
        if (!this.type.group.footsteps) return
        const volumeRatio = moving && this.isActive() && !this.isDying
            ? AudioUtils.getVolumeRatioByDistance(this.parent.pos, 2) : 0
        if (volumeRatio <= 0) {
            this.stopFootsteps()
            return
        }
        const block = WorldDataManager.getBlockOnPosition(this.parent.pos)
        const type = block?.snowed ? FootStepTypes.SNOW
            : block?.type === WATER_BLOCK_TYPE ? FootStepTypes.WATER : FootStepTypes.DIRT
        const source = AudioManager.footStepSounds.get(type) as (Sound & {loaded?: boolean, defaultVolume?: number}) | undefined
        if (!source?.loaded) {
            this.stopFootsteps()
            return
        }
        let sound = this.footStepSounds.get(type)
        if (!sound) {
            const clone = source.clone()
            if (!clone) return
            sound = clone
            this.footStepSounds.set(type, sound)
        }
        this.stopFootsteps(sound)
        const running = this.parent.runSpeed > 2
        const speedRatio = this.parent.runSpeed / (running ? 3.2 : 2)
        const playbackRate = type === FootStepTypes.SNOW
            ? (running ? FootStepSpeeds.SNOW_RUN : FootStepSpeeds.SNOW_WALK)
            : type === FootStepTypes.WATER
                ? (running ? FootStepSpeeds.WATER_RUN : FootStepSpeeds.WATER_WALK)
                : (running ? FootStepSpeeds.DIRT_RUN : FootStepSpeeds.DIRT_WALK)
        sound.setPlaybackRate(playbackRate * speedRatio)
        sound.setVolume((source.defaultVolume ?? 1) * volumeRatio * speedRatio)
        if (!sound.isPlaying) sound.play()
    }

    private stopFootsteps(except?: Sound) {
        this.footStepSounds.forEach(sound => {
            if (sound !== except && sound.isPlaying) sound.stop()
        })
    }

    doWalk() {
        this.pendingAttackSoundAnim = null
        this.idleAnimationFrozen = false
        this.transitionToAnimation(this.walkAnim!, true, true, this.parent.mobType.walkAnimSpeed)
    }

    doIdle(animate: boolean) {
        this.pendingAttackSoundAnim = null

        if (!animate) {
            if (this.idleAnimationFrozen) return

            this.activeAnims.forEach(anim => anim.stop())
            this.activeAnims.clear()
            this.idleAnim?.start(false, 1, true)
            this.idleAnim?.stop()
            this.idleAnimationFrozen = true
            return
        }

        this.idleAnimationFrozen = false
        this.transitionToAnimation(this.idleAnim!, true, true, 1.0)
    }

    setSelectedVisual(selected: boolean) {
        this.selected = selected
        if (!this.initialized) return

        this.refreshSelectedMaterial()
    }

    private refreshSelectedMaterial() {
        const shouldApplySelectedMaterial = this.selected && Lights.daylightFactor < 1
        if (this.selectedMaterialApplied === shouldApplySelectedMaterial
            && this.mesh.material === this.getBodyMaterial(shouldApplySelectedMaterial)) return

        this.applySelectedMaterial(shouldApplySelectedMaterial)
        this.selectedMaterialApplied = shouldApplySelectedMaterial
    }

    private getBodyMaterial(selected: boolean) {
        if (this.type.id === 1201 && this.parent.woolReadyAt > Date.now()) {
            return selected ? MonsterLoader.selectedShavedSheepMaterial : MonsterLoader.shavedSheepMaterial
        }
        return selected ? this.template.selectedMaterial : this.template.material
    }

    private applySelectedMaterial(selected: boolean) {
        const material = this.getBodyMaterial(selected)
        this.node.getChildMeshes().forEach(mesh => {
            mesh.material = material ?? null
        })
    }

    private async warmMonsterMaterials() {
        try {
            this.applySelectedMaterial(false)
            await Lights.warmActorMaterial(this.mesh)

            this.applySelectedMaterial(true)
            await Lights.warmActorMaterial(this.mesh)
        } finally {
            if (!this.node.isDisposed()) {
                const shouldApplySelectedMaterial = this.selected && Lights.daylightFactor < 1
                this.applySelectedMaterial(shouldApplySelectedMaterial)
                this.selectedMaterialApplied = shouldApplySelectedMaterial
            }
        }
    }

    doDie() {
        this.stopFootsteps()
        if (!this.isActive()) return
        this.idleAnimationFrozen = false
        this.pendingAttackSoundAnim = null
        const deathAnimationSpeed = this.type.deathAnimSpeed
        this.transitionToAnimation(this.deadAnim!, true, false, deathAnimationSpeed)

        this.isDying = true
        this.disposeWeaponTrail()
        this.fadeOutTimer = new Date().getTime() + (525 * (2.5 / deathAnimationSpeed))

        AudioManager.playDeathRattle(this.parent.mobType.monsterSoundType, this.parent.pos)
    }

    transitionToAnimation(target: MeshAnimation | undefined, fadeIn: boolean = false, loop = false, speed = 1.0) {
        if (!this.isActive() || target == null) return

        this.activeAnims.forEach(anim => {
            if (anim !== target) {
                anim.fadeOut()
            }
        })

        if (this.mesh && !this.activeAnims.has(target!)) {
            target.start(fadeIn, speed, loop)
            this.activeAnims.add(target)
        }
    }

    addToView() {
        this.viewRequested = true
        const initializedNow = !this.initialized
        if (initializedNow) {
            this.initializeModel()

            // On drivers exposing KHR_parallel_shader_compile, do not let the
            // first skinned render stall the game. The clone stays hidden until
            // the exact body-material/light variant is ready. It may pop in a
            // little later, which is preferable to a frame hitch.
            if (Lights.supportsParallelShaderCompilation()) {
                this.preparingFirstView = true
                this.node.setEnabled(false)
                this.mesh.setEnabled(false)
                this.equipSet.forEach(item => EquipManager.removeEquippedItem(item))

                void this.warmMonsterMaterials().finally(() => {
                    this.preparingFirstView = false
                    if (this.viewRequested && !this.node.isDisposed()) {
                        const template = MonsterLoader.monsterTemplates.get(this.template.id)
                        if (template?.clonesInact.includes(this.template)) {
                            template.activateClone(this.template)
                        } else {
                            this.node.setEnabled(true)
                            this.mesh.setEnabled(true)
                        }
                        ActiveMeshFreezer.setSkeletonActive(this.skeleton, true)
                        this.equipSet.forEach(item => EquipManager.addEquippedItem(item))
                        this.parent.nameDisplayTime = Date.now() + 3000
                    }
                })
                return
            }
            ActiveMeshFreezer.setSkeletonActive(this.skeleton, true)
            return
        }

        if (this.preparingFirstView) {
            return
        }

        MonsterLoader.monsterTemplates.get(this.template.id)?.activateClone(this.template)
        ActiveMeshFreezer.setSkeletonActive(this.skeleton, true)
        this.equipSet.forEach(item => {
            EquipManager.addEquippedItem(item)
        })

        this.parent.nameDisplayTime = Date.now() + 3000
    }

    removeFromView() {
        this.stopFootsteps()
        this.viewRequested = false
        this.pendingAttackSoundAnim = null
        if (this.initialized) {
            ActiveMeshFreezer.setSkeletonActive(this.skeleton, false)
            // The base group is only a source for the actual animation clips.
            // Paused clip animatables otherwise remain in Babylon's per-frame
            // active list after their monster leaves the viewport.
            this.activeAnims.forEach(anim => anim.stop())
            this.activeAnims.clear()
            this.idleAnimationFrozen = false
            this.animation.stop()
            MonsterLoader.monsterTemplates.get(this.template.id)?.deactivateClone(this.template)
        }
        this.equipSet.forEach(item => {
            EquipManager.removeEquippedItem(item)
        })
    }

    removeFromScene() {
        this.footStepSounds.forEach(sound => sound.dispose())
        this.footStepSounds.clear()
        this.viewRequested = false
        this.parent.insideView = false
        this.nameTextNode.dispose()
        this.lhandNode.dispose()
        if (!this.initialized) {
            return
        }

        this.removeFromView()
        this.equipSet.forEach(item => item.disposeWeaponTrail())
        this.equipSet.clear()
        this.weaponEquipItem = null
        this.pendingAttackSoundAnim = null
        MonsterLoader.monsterTemplates.get(this.template.id)?.freeClone(this.template)
        this.activeAnims.clear()
        this.initialized = false
    }

    setWeaponTrailEnabled(enabled: boolean) {
        if (enabled && !Settings.isCombatEffectEnabled(this.parent.autoAttackTarget === MyPlayer.myChar)) {
            return
        }
        this.weaponEquipItem?.setWeaponTrailEnabled(enabled)
    }

    disposeWeaponTrail() {
        this.weaponEquipItem?.disposeWeaponTrail()
    }

    getNameTextNodeWorldPosition(): Vector3 {
        const worldMatrix = this.nameTextNode.getWorldMatrix()
        const position = new Vector3()
        worldMatrix.decompose(undefined, undefined, position)
        return position
    }

    getOwnerId(): number {
        return this.parent.id
    }

    getEquipmentDebugLabel(): string {
        return `${this.type.name} / ${this.template.meshName} / ID ${this.parent.id}`
    }

    getWeaponScale(): Vector3 | undefined {
        return this.parent.mobType.weapon?.scale
    }

    getMasterNode(): Mesh | AbstractMesh | undefined {
        return this.node
    }

    isActive(): boolean {
        return this.parent.insideView && this.initialized
    }

    createDyingParticleEffect() {
        const highDetail = Settings.isDetalLevelHigh()
        const particleCount = highDetail ? 200 : Settings.isDetailLevelMedium() ? 64 : 24
        const particleSizeRatio = highDetail ? 1 : 1.25
        const ps = GfxManager.getDeathParticleSystem()
        if (!ps) return
        ps.color1.set(1, 1, 1, 1)
        ps.color2.set(1, 1, 1, 1)
        ps.colorDead.set(0, 0, 0, 1)

        // Set particle color based on terrain type
        const block = WorldDataManager.getBlockOnPosition(this.parent.pos)
        if (block) {
            TerrainManager.setParticleSplashColorByTerrainType(ps, block)
        }

        // Babylon particles are effectively self-lit, so without this they stay
        // unnaturally bright outdoors at night. Match their RGB brightness to
        // the continuous day/night blend while preserving terrain tint/alpha.
        if (!Lights.indoor) {
            const brightness = 0.3 + (0.7 * Lights.daylightFactor)
            ps.color1.r *= brightness
            ps.color1.g *= brightness
            ps.color1.b *= brightness
            ps.color2.r *= brightness
            ps.color2.g *= brightness
            ps.color2.b *= brightness
            ps.colorDead.r *= brightness
            ps.colorDead.g *= brightness
            ps.colorDead.b *= brightness
        }

        const xOff = Math.sin(this.modelRotation + Math.PI / 2) * -0.75
        const zOff = Math.cos(this.modelRotation + Math.PI / 2) * -0.75

        // Particle positions are emitted in world space; no scene node is needed.
        ;(ps.emitter as Vector3).copyFrom(this.node.position)

        ps.minEmitBox = new Vector3(-0.7 + xOff  , -0.2, -0.7 + zOff)
        ps.maxEmitBox = new Vector3(0.7 + xOff, 0.2, 0.7 + zOff)

        // At updateSpeed 0.02 this is ~1.25–2.9 real seconds, covering the
        // upward burst and fall without a long simulation below the floor.
        ps.minLifeTime = 1.5
        ps.maxLifeTime = 3.5
        ps.minEmitPower = 0.15
        ps.maxEmitPower = 0.4
        ps.minSize = 0.1 * particleSizeRatio
        ps.maxSize = 0.15 * particleSizeRatio

        ps.direction1 = new Vector3(-0.8, 2.5, -0.8)
        ps.direction2 = new Vector3(0.8, 4.0, 0.8)
        ps.gravity = new Vector3(0, -1, 0)

        ps.emitRate = 0
        ps.manualEmitCount = particleCount
        ps.updateSpeed = 0.02

        // Stop emission after the first rendered batch, then retain the empty
        // system for reuse. A tiny targetStopDuration could stop before the
        // first batch on slower frames, discarding the effect immediately.
        ps.onBeforeDrawParticlesObservable.addOnce(() => ps.stop())
        ps.start()
    }
}
