import {
    AbstractMesh,
    AnimationGroup, Matrix, Mesh, Quaternion,
    SceneLoader, Skeleton, Sound, TransformNode,
    Vector3,
} from '@babylonjs/core'
import { AudioManager } from '@/babylon/audio/audioManager'
import { Materials } from '@/babylon/materials'
import { AnimTransition } from '@/babylon/animations/animation'
import { Lights } from '@/babylon/scene/lights'
import Character from '@/babylon/character/character'
import { Renderer } from '@/babylon/scene/renderer'
import { Utils } from '@/utils/utils'
import { MyPlayer } from '@/data/myPlayer'
import { EquipBearer, EquipItem, EquipManager } from '@/babylon/item/equipManager'
import { BabylonUtils } from '@/babylon/utils'

export class CharacterModel implements EquipBearer {
    parent: Character
    node: TransformNode = new TransformNode("characterModelNode")
    nameTextNode: TransformNode
    initialized: boolean = false

    model: AbstractMesh | undefined
    modelYAngleOffset: number = Math.PI * 1 / 4
    worldMatrix: Matrix
    rotationQuaternion: Quaternion

    skeleton: Skeleton | undefined
    lhandNode: TransformNode = new TransformNode("lhandNode")
    rhandNode: TransformNode = new TransformNode("rhandNode")

    walkAnim: AnimationGroup | undefined
    runAnim: AnimationGroup | undefined
    idleAnim: AnimationGroup | undefined
    combatIdleAnim: AnimationGroup | undefined
    slashAnim: AnimationGroup | undefined
    slashAnim2: AnimationGroup | undefined
    jabAnim: AnimationGroup | undefined
    leftSlashAnim: AnimationGroup | undefined
    rightSlashAnim: AnimationGroup | undefined
    highJabAnim: AnimationGroup | undefined

    actualAnim: AnimationGroup | undefined
    animTransition: AnimTransition | null = null

    equipSet: Set<EquipItem> = new Set()
    weaponEquipItem: EquipItem | null = null

    actualStepSound: Sound | null = null
    footStepSounds: Map<string, Sound> = new Map()

    constructor(parent: Character) {
        this.parent = parent
        this.node.position.copyFrom((this.parent.pos))
        this.nameTextNode = new TransformNode("nameTextNode" + this.parent.id)
    }

    static async create(data: Character, init: boolean): Promise<CharacterModel> {
        const model = new CharacterModel(data);
        if (init) await model.initAsync();
        return model;
    }

    async initAsync() {
        await SceneLoader.ImportMeshAsync(
            "",
            "/models/steve/",
            "steve2.gltf",
            Renderer.scene
        ).then((result) => {
            this.model = result.meshes[0]
            this.model.parent = this.node
            this.model.scaling = new Vector3(0.25, 0.25, 0.25)
            this.model.rotation = new Vector3(0, 0, 0)

            this.nameTextNode.parent = this.node
            this.nameTextNode.position.y = this.parent.getModelHeight()
            this.parent.nameDisplayTime = Date.now() + 3000

            // Apply material
            const material = Materials.getPBRMaterial(Renderer.scene, "steveMaterial", "/models/steve/steve.jpg", false, false,  {
                metallic: 0,
                roughness: 1,
                directIntensity: 1,
                environmentIntensity: 1,
            })
            this.model.getChildMeshes().forEach((mesh) => {
                mesh.material = material
                Lights.addShadowCaster(mesh)
            });

            // Process animations
            if (result.animationGroups.length > 0) {
                const animationGroup = result.animationGroups[0]; // Assuming there is one animation group
                animationGroup.stop()

                // Define frame ranges for each animation
                const animations = [
                    { name: "Idle", startFrame: 0, endFrame: 75 },
                    { name: "Walk", startFrame: 76, endFrame: 225 },
                    { name: "Run", startFrame: 226, endFrame: 375 },
                    { name: "CombatIdle", startFrame: 400, endFrame: 475 },

                    // Attack animations are cut off last 15 frames to join smoothly with the next animation
                    { name: "Slash", startFrame: 500, endFrame: 560},
                    { name: "Jab", startFrame: 600, endFrame: 660},
                    { name: "LeftSlash", startFrame: 700, endFrame: 760},
                    { name: "RightSlash", startFrame: 800, endFrame: 860},
                    { name: "HighJab", startFrame: 900, endFrame: 960},
                    { name: "Slash2", startFrame: 1000, endFrame: 1060},
                ];

                const newAnimationGroups = animations.map(({ name, startFrame, endFrame }) => {
                    const newGroup = animationGroup.clone(name);
                    newGroup.from = startFrame;
                    newGroup.to = endFrame;
                    return newGroup;
                });

                this.idleAnim = newAnimationGroups[0]
                this.walkAnim = newAnimationGroups[1]
                this.runAnim = newAnimationGroups[2]
                this.combatIdleAnim = newAnimationGroups[3]
                this.slashAnim = newAnimationGroups[4]
                this.jabAnim = newAnimationGroups[5]
                this.leftSlashAnim = newAnimationGroups[6]
                this.rightSlashAnim = newAnimationGroups[7]
                this.highJabAnim = newAnimationGroups[8]
                this.slashAnim2 = newAnimationGroups[9]

                this.idleAnim?.start(true, 0.5)
            }
            this.skeleton = result.skeletons[0];
            this.lhandNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.012")!, this.model) // Lhand 012
            this.rhandNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.009")!, this.model) // Rhand 009
        }).catch((error) => {
            console.error("Error loading model:", error)
        });

        this.assignArmor(100, 3)
        this.assignHelmet(210, 3)
        this.assignLeftPauldron(300, 0)
        this.assignRightPauldron(300, 0)
        this.assignRightLeg(400, 0)
        this.assignLeftLeg(400, 0)

        this.assignWeapon(3, 0)
        this.initialized = true
    }

    assignArmor(type: number, matIndex: number) {
        this.addEquippedItem(new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.001")!, null, null, null))
    }

    assignHelmet(type: number, matIndex: number) {
        this.addEquippedItem(new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.002")!, null, null, null))
    }

    assignLeftPauldron(type: number, matIndex: number) {
        this.addEquippedItem(new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.010")!, null, new Vector3(0, - Math.PI / 2, 0), null))
    }

    assignRightPauldron(type: number, matIndex: number) {
        this.addEquippedItem(new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.003")!, null, new Vector3(0, Math.PI / 2, 0), new Vector3(0.02, 0, 0.02)))
    }

    assignLeftLeg(type: number, matIndex: number) {
        this.addEquippedItem(new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.008")!, null, null, null))
    }

    assignRightLeg(type: number, matIndex: number) {
        this.addEquippedItem(new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.006")!, null, null, null))
    }

    assignWeapon(type: number, matIndex: number) {
        this.weaponEquipItem = new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.009")!, null, null, null)
        //this.weaponEquipItem.createSwordParticles(this.rhandNode)
        this.addEquippedItem(this.weaponEquipItem)
    }

    addEquippedItem(item: EquipItem) {
        this.equipSet.add(item)
        EquipManager.addEquippedItem(item)
    }

    startWalkAnimation() {
        if (this.actualAnim !== this.walkAnim) {
            this.transitionToAnimation(this.walkAnim, 0.15, true, 3)
            this.actualAnim = this.walkAnim

            this.actualStepSound = this.getStepSound()
            this.actualStepSound.setPlaybackRate(this.parent.getStepSoundSpeed())
            if (!this.actualStepSound.isPlaying) {
                this.actualStepSound.play()
            }
            this.stopAllStepSounds(this.actualStepSound)
        }
    }

    startRunAnimation() {
        if (this.actualAnim !== this.runAnim) {
            this.transitionToAnimation(this.runAnim, 0.15, true, 3)
            this.actualAnim = this.runAnim

            this.actualStepSound = this.getStepSound()
            this.actualStepSound.setPlaybackRate(this.parent.getStepSoundSpeed())
            if (!this.actualStepSound.isPlaying) {
                this.actualStepSound.play()
            }
            this.stopAllStepSounds(this.actualStepSound)
        }
    }

    checkActiveStepSound() {
        const supposedStepSound = this.getStepSound()
        if (this.actualStepSound?.isPlaying && this.actualStepSound !== supposedStepSound) {
            this.actualStepSound = supposedStepSound
            this.actualStepSound.setPlaybackRate(this.parent.getStepSoundSpeed())
            if (!this.actualStepSound.isPlaying) {
                this.actualStepSound.play()
            }
            this.stopAllStepSounds(this.actualStepSound)
        }
    }

    doAttackAnimation() {
        // Random select attack animation
        const desiredAnimation = [this.slashAnim, this.jabAnim, this.leftSlashAnim, this.rightSlashAnim, this.highJabAnim, this.slashAnim2][Math.floor(Math.random() * 6)]
        if (this.actualAnim !== desiredAnimation) {
            this.transitionToAnimation(desiredAnimation, 0.15, false, 1000 / this.parent.attackAnimationTime)
            this.actualAnim = desiredAnimation

            this.stopAllStepSounds()
        }
    }

    stopAnimation() {
        const desiredAnimation = this.combatIdleAnim
        const animSpeed = 0.75

        if (this.actualAnim !== desiredAnimation) {
            this.transitionToAnimation(desiredAnimation, 0.25, true, animSpeed)
            this.actualAnim = desiredAnimation
        }

        this.stopAllStepSounds()
    }

    getStepSound(): Sound {
        const stepSoundType = this.parent.getFootStepSoundType()
        if (!this.footStepSounds.has(stepSoundType)) {
            const sound = AudioManager.footStepSounds.get(stepSoundType)
            this.footStepSounds.set(stepSoundType, sound!.clone()!)
        }
        return this.footStepSounds.get(stepSoundType)!
    }

    stopAllStepSounds(except: Sound | null = null) {
        this.footStepSounds.forEach(sound => {
            if (sound != except && sound.isPlaying) {
                sound.stop()
            }
        })
    }

    transitionToAnimation(targetAnim: AnimationGroup | undefined, duration: number, loop = false, speed = 1.0) {
        if (!this.actualAnim || !targetAnim || this.actualAnim === targetAnim) return;

        // If there is already an ongoing transition
        if (this.animTransition) {
            // Force end the transition if the target animation is different
            if (this.animTransition.toAnimation !== targetAnim) {
                this.animTransition.forceEnd()
            } else {
                return
            }
        }

        this.animTransition = new AnimTransition(duration, this.actualAnim, targetAnim, loop, speed)
    }

    onFrame(timeRate: number) {
        if (this.animTransition) {
            this.animTransition.onFrame(timeRate)
            if (this.animTransition.ended) {
                this.animTransition = null
            }
        }

        this.checkActiveStepSound()
        if (this.parent !== MyPlayer.myChar || this.parent.getMoveAngle() != null || Math.abs(this.parent.pos.y - this.parent.logicYpos) > 0.1) {
            this.moveModel(timeRate)
        }
        if (this.parent.getLookAngle() != null) {
            this.resolveModelRotation(timeRate)
        }

        if (this.model) {
            this.rotationQuaternion = new Quaternion()
            this.worldMatrix = this.model!.getWorldMatrix();
            this.worldMatrix.decompose(new Vector3(), this.rotationQuaternion, new Vector3());
        }

        this.equipSet.forEach(item => {
            item.onFrame()
        })
    }

    /**
     * Approximate model to the player position
     */
    moveModel(timeRate: number) {
        const approximationSpeed = this.parent == MyPlayer.myChar ? 12 : 8
        this.node.position.x += (this.parent.pos.x - this.node.position.x) * approximationSpeed * timeRate
        this.node.position.z += (this.parent.pos.z - this.node.position.z) * approximationSpeed * timeRate
        this.node.position.y += (this.parent.logicYpos - this.node.position.y) * this.parent.yMoveSpeed * timeRate

        this.node.markAsDirty("position")
        this.node.computeWorldMatrix(true);

        if (this.model) {
            this.model.computeWorldMatrix(true);
        }
    }

    /**
     * Rotate model fluently to the look angle
     */
    resolveModelRotation(timeRate: number) {
        if (!this.model) {
            return
        }
        const model = this.model!
        const lookAngle = this.parent.getLookAngle()
        if (lookAngle == null) return

        const rotationSpeed = (this.parent == MyPlayer.myChar ? 15 : 8) * timeRate
        let current = model.rotation.y - this.modelYAngleOffset

        const delta = Math.atan2(
            Math.sin(lookAngle - current),
            Math.cos(lookAngle - current)
        )

        if (Math.abs(delta) <= rotationSpeed) {
            current += delta
        } else {
            current += Math.sign(delta) * rotationSpeed
        }
        model.rotation.y = current + this.modelYAngleOffset
        this.parent.modelRotation = model.rotation.y
    }

    setWeaponTrailEnabled(enabled: boolean) {
        this.weaponEquipItem?.weaponTrail?.setEnabled(enabled)
    }

    disposeWeaponTrail() {
        this.weaponEquipItem?.weaponTrail?.dispose()
    }

    getOwnerId(): number {
        return this.parent.id
    }

    getNameTextNodeWorldPosition(): Vector3 {
        const worldMatrix = this.nameTextNode.getWorldMatrix()
        const position = new Vector3()
        worldMatrix.decompose(undefined, undefined, position)
        return position
    }

    getWeaponScale(): Vector3 | undefined {
        return BabylonUtils.getSymVector(1.5)
    }

    getMasterNode(): Mesh | AbstractMesh | undefined {
        return this.model
    }

    async addToView() {
        if (!this.initialized) await this.initAsync()
        this.model!.setEnabled(true)
        this.equipSet.forEach(item => {
            EquipManager.addEquippedItem(item)
            if (item.hasSwordParticles) {
                item.createSwordParticles(this.rhandNode)
            }
        })
        this.parent.nameDisplayTime = Date.now() + 3000
    }

    removeFromView() {
        if (this.initialized) {
            this.model!.setEnabled(false)
        }
        this.equipSet.forEach(item => {
            EquipManager.removeEquippedItem(item)
        })
    }

    removeFromScene() {
        this.removeFromView()
        this.model?.dispose()
        this.node.dispose()
        this.disposeWeaponTrail()
    }
}
