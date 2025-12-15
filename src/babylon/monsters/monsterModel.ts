import {
    AnimationGroup, Bone, Matrix,
    Mesh, Quaternion,
    Skeleton, Vector3,
} from '@babylonjs/core'
import { Monster } from '@/babylon/monsters/monster'
import { MonsterLoader } from '@/babylon/monsters/monsterLoader'
import { MonsterCodebook, MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { Data } from '@/data/globalData'
import { MeshAnimation } from '@/babylon/animations/animation'
import { MonsterTemplate } from '@/babylon/monsters/codebook/monsterTemplates'
import { MobEquipItem, MobEquipManager } from '@/babylon/item/mobEquipManager'

export class MonsterModel {
    parent: Monster
    type: MonsterType
    initialized: boolean = false
    node: Mesh
    mesh: Mesh

    template: MonsterTemplate
    modelYpos: number = 0
    modelRotation: number = 0
    modelYAngleOffset: number = Math.PI * 1 / 4

    skeleton: Skeleton
    animation: AnimationGroup

    idleAnim: MeshAnimation | undefined
    walkAnim: MeshAnimation | undefined
    activeAnims: Set<MeshAnimation>

    equipSet: Set<MobEquipItem> = new Set()

    chestBone: Bone
    rhandBone: Bone
    lhandBone: Bone
    headBone: Bone
    chestBoneW: Bone
    rhandBoneW: Bone
    lhandBoneW: Bone
    headBoneW: Bone

    rotationQuaternion: Quaternion
    worldMatrix: Matrix

    constructor(monsterType: MonsterType, parent: Monster) {
        console.log('MonsterModel constructor')
        this.parent = parent
        this.type = monsterType
        this.activeAnims = new Set<MeshAnimation>()
    }

    /**
     * Initialize the model - for monsters out of view this is done only when they enter the view for the first time
     */
    initializeModel() {
        this.template = MonsterLoader.getMonsterClone(this.type)
        this.node = this.template.node
        this.mesh = this.template.mesh
        this.skeleton = this.template.skeleton
        this.animation = this.template.animation

        MonsterCodebook.initializeEquipAndAnimations(this)
        this.initialized = true
    }

    assignRhand(type: number, matIndex: number, scale = new Vector3(1, 1, 1)) {
        // this.addEquippedItem(new MobEquipItem(MobEquipManager.itemTypes.get(type)!, matIndex, this, this.rhandBone, this.rhandBoneW, scale))
    }

    assignChest(type: number, matIndex: number, scale = new Vector3(1, 1, 1)) {
        this.addEquippedItem(new MobEquipItem(MobEquipManager.itemTypes.get(type)!, matIndex, this, this.chestBone, this.chestBoneW, scale))
    }

    assignHelmet(type: number, matIndex: number, scale = new Vector3(1, 1, 1)) {
        this.addEquippedItem(new MobEquipItem(MobEquipManager.itemTypes.get(type)!, matIndex, this, this.headBone, this.headBoneW, scale))
    }

    addEquippedItem(item: MobEquipItem) {
        this.equipSet.add(item)
        MobEquipManager.addEquippedItem(item)
    }

    onFrame(timeRate: number) {
        this.resolveMovement(timeRate)

        this.rotationQuaternion = new Quaternion()
        this.worldMatrix = this.mesh.getWorldMatrix();
        this.worldMatrix.decompose(new Vector3(), this.rotationQuaternion, new Vector3());

        this.equipSet.forEach(item => {
            item.onFrame()
        })
    }

    onAnimFrame(animFrame: number) {
        if (this.activeAnims.size > 0) {
            this.skeleton.prepare()

            this.activeAnims.forEach(anim => {
                anim.onAnimFrame(animFrame)
                if (!anim.running) {
                    this.activeAnims.delete(anim)
                }
            })
        }
    }

    resolveMovement(timeRate: number) {
        this.node.position.x = this.parent.xPos - Data.myChar.xPos
        this.node.position.z = this.parent.zPos - Data.myChar.zPos

        this.resolveModelYpos(timeRate)
        this.resolveModelRotation(timeRate)

        // Actualize the world matrix immediately for equpped items to move with the model correctly
        this.mesh.computeWorldMatrix(true)
    }

    /**
     * Approximate model Y position to the player Y position
     */
    resolveModelYpos(timeRate: number) {
        this.node.position.y = (this.parent.yPos - Data.myChar.modelYpos)
        this.modelYpos = this.node.position.y
    }

    /**
     * Approximate model rotation to the move angle
     */
    resolveModelRotation(timeRate: number) {
        if (this.parent.moveAngle == null) {
            return
        }

        const myAngle = this.node.rotation.y - this.modelYAngleOffset

        let angleDifference = this.parent.moveAngle - myAngle;
        const rotationSpeed = this.parent.rotationSpeed * timeRate;
        if (angleDifference > Math.PI) {
            angleDifference -= 2 * Math.PI;
        } else if (angleDifference < -Math.PI) {
            angleDifference += 2 * Math.PI;
        }

        if (Math.abs(angleDifference) < rotationSpeed) {
            this.node.rotation.y = this.parent.moveAngle + this.modelYAngleOffset;
        } else {
            this.node.rotation.y += Math.sign(angleDifference) * rotationSpeed;
        }
        this.modelRotation = this.node.rotation.y;
    }

    addToView() {
        if (!this.initialized) this.initializeModel()

        MonsterLoader.monsterTemplates.get(this.template.id)?.activateClone(this.template)
        this.equipSet.forEach(item => {
            MobEquipManager.addEquippedItem(item)
        })
    }

    removeFromView() {
        if (this.initialized) {
            MonsterLoader.monsterTemplates.get(this.template.id)?.deactivateClone(this.template)
        }
        this.equipSet.forEach(item => {
            MobEquipManager.removeEquippedItem(item)
        })
    }

    removeFromScene() {
        this.removeFromView()
        if (this.initialized) {
            MonsterLoader.monsterTemplates.get(this.template.id)?.freeClone(this.template)
        }
    }

    doWalk() {
        this.mesh.skeleton = this.template.walkSkeleton
        this.equipSet.forEach(item => {
            item.setWalking(true)
        })
        this.activeAnims.clear()
    }

    doIdle() {
        this.mesh.skeleton = this.skeleton
        this.equipSet.forEach(item => {
            item.setWalking(false)
        })
        this.transitionToAnimation(this.idleAnim!, true, true, 1.0)
    }

    transitionToAnimation(target: MeshAnimation, fadeIn: boolean = false, loop = false, speed = 1.0) {
        this.activeAnims.forEach(anim => {
            if (anim !== target) {
                anim.fadeOut()
            }
        })

        if (!this.activeAnims.has(target!)) {
            this.mesh.skeleton = this.skeleton
            target.start(fadeIn, speed, loop)
            this.activeAnims.add(target)
        }
    }
}
