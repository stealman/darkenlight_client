import {
    AbstractMesh,
    AnimationGroup, Bone, Matrix,
    Mesh, ParticleSystem, Quaternion,
    Skeleton, Texture, TransformNode, Vector3,
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
import { AudioManager } from '@/babylon/audio/audioManager'
import { TerrainManager } from '@/babylon/world/terrainManager'
import { Settings } from '@/settings/settings'

export class MonsterModel implements EquipBearer {
    parent: Monster
    type: MonsterType
    initialized: boolean = false
    node: Mesh
    mesh: Mesh
    nameTextNode: TransformNode

    template: MonsterTemplate

    worldMatrix: Matrix
    rotationQuaternion: Quaternion
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

        this.resolveMovement(timeRate)
        this.rotationQuaternion = new Quaternion()
        this.worldMatrix = this.mesh.getWorldMatrix();
        this.worldMatrix.decompose(new Vector3(), this.rotationQuaternion, new Vector3());

        this.equipSet.forEach(item => {
            item.onFrame()
        })
    }

    onAnimFrame() {
        if (!this.isActive()) return

        if (this.activeAnims.size > 0) {
            this.skeleton.prepare()
            this.activeAnims.forEach(anim => {
                anim.onAnimFrame()
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
        // approximate to x and z position
        if (!this.isDying) {
            this.node.position.x += (this.parent.pos.x - this.node.position.x) * 15 * timeRate
            this.node.position.z += (this.parent.pos.z - this.node.position.z) * 15 * timeRate

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
        this.parent.pos.y += (this.parent.logicYpos - this.parent.pos.y) * 15 * timeRate
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
        const baseAnimSpeed = 1000

        const possibleAnims = []
        if (!this.parent.isWeaponRanged()) {
            possibleAnims.push(this.attackAnims[0])
            possibleAnims.push(this.attackAnims[1])
        } else {
            possibleAnims.push(this.attackBowAnim)
        }

        const anim = possibleAnims[Utils.rollDice(possibleAnims.length, true)]
        this.transitionToAnimation(anim, true, false, baseAnimSpeed / this.parent.attackAnimationTime)
        this.setWeaponTrailEnabled(true)
    }

    doWalk() {
        this.transitionToAnimation(this.walkAnim!, true, true, this.parent.mobType.walkAnimSpeed)
    }

    doIdle() {
        this.transitionToAnimation(this.idleAnim!, true, true, 1.0)
    }

    doDie() {
        if (!this.isActive()) return
        this.transitionToAnimation(this.deadAnim!, true, false, 2.5)

        this.isDying = true
        this.disposeWeaponTrail()
        this.fadeOutTimer = new Date().getTime() + 525

        AudioManager.playDeathRattle(this.parent.mobType.monsterSoundType, this.parent.pos)
    }

    transitionToAnimation(target: MeshAnimation, fadeIn: boolean = false, loop = false, speed = 1.0) {
        if (!this.isActive()) return

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
        if (!this.initialized) this.initializeModel()
        MonsterLoader.monsterTemplates.get(this.template.id)?.activateClone(this.template)
        this.equipSet.forEach(item => {
            EquipManager.addEquippedItem(item)
        })

        this.parent.nameDisplayTime = Date.now() + 3000
    }

    removeFromView() {
        if (this.initialized) {
            this.animation.stop()
            MonsterLoader.monsterTemplates.get(this.template.id)?.deactivateClone(this.template)
        }
        this.equipSet.forEach(item => {
            EquipManager.removeEquippedItem(item)
        })
    }

    removeFromScene() {
        this.removeFromView()
        if (this.initialized) {
            MonsterLoader.monsterTemplates.get(this.template.id)?.freeClone(this.template)
        }
    }

    setWeaponTrailEnabled(enabled: boolean) {
        this.weaponEquipItem?.weaponTrail?.setEnabled(enabled)
    }

    disposeWeaponTrail() {
        this.weaponEquipItem?.weaponTrail?.dispose()
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
        const particleCount = Settings.detailLevel.level * 100
        const ps = new ParticleSystem('deathPoof', particleCount, Renderer.scene)
        ps.particleTexture = new Texture("images/gfx/flare-rect.png", Renderer.scene);

        // Set particle color based on terrain type
        TerrainManager.setParticleSplashColorByTerrainType(ps, WorldDataManager.getBlockOnPosition(this.parent.pos)!)

        const xOff = Math.sin(this.modelRotation + Math.PI / 2) * -0.75
        const zOff = Math.cos(this.modelRotation + Math.PI / 2) * -0.75

        const computedFallPosition = this.node.position
        const emitter = new TransformNode('deathEmitter', Renderer.scene)
        emitter.position.copyFrom(computedFallPosition)
        ps.emitter = emitter

        ps.minEmitBox = new Vector3(-0.7 + xOff  , -0.2, -0.7 + zOff)
        ps.maxEmitBox = new Vector3(0.7 + xOff, 0.2, 0.7 + zOff)

        ps.minLifeTime = 6
        ps.maxLifeTime = 9
        ps.minEmitPower = 0.15
        ps.maxEmitPower = 0.4
        ps.minSize = 0.1
        ps.maxSize = 0.15

        ps.direction1 = new Vector3(-0.8, 2.5, -0.8)
        ps.direction2 = new Vector3(0.8, 4.0, 0.8)
        ps.gravity = new Vector3(0, -1, 0)

        ps.blendMode = ParticleSystem.BLENDMODE_STANDARD
        ps.emitRate = 0
        ps.manualEmitCount = particleCount
        ps.updateSpeed = 0.02

        ps.disposeOnStop = true
        ps.start()
    }
}
