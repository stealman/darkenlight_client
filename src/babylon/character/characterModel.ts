import {
    AbstractMesh,
    AnimationGroup, Mesh,
    Scene,
    SceneLoader, Skeleton, Sound, TransformNode,
    Vector3,
} from '@babylonjs/core'
import { AudioManager } from '@/babylon/audio/audioManager'
import { Materials } from '@/babylon/materials'
import { CharEquipManager } from '@/babylon/item/charEquipManager'
import { PlayerData } from '@/data/playerData'
import { AnimTransition } from '@/babylon/animations/animation'
import { Renderer } from '@/babylon/scene/renderer'

export class CharacterModel {
    playerData: PlayerData
    node: TransformNode = new TransformNode("characterModelNode")

    model: AbstractMesh | undefined
    modelYAngleOffset: number = Math.PI * 1 / 4
    skeleton: Skeleton | undefined
    headNode: TransformNode = new TransformNode("headNode")
    torsoNode: TransformNode = new TransformNode("torsoNode")
    larmNode: TransformNode = new TransformNode("larmNode")
    rarmNode: TransformNode = new TransformNode("rarmNode")
    llegNode: TransformNode = new TransformNode("llegNode")
    rlegNode: TransformNode = new TransformNode("rlegNode")

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
    weaponMesh: Mesh | null = null

    actualStepSound: Sound | null = null
    footStepSounds: Map<string, Sound> = new Map()

    constructor(playerData: PlayerData) {
        this.playerData = playerData
        this.node.position = this.playerData.pos
    }

    static async create(data: PlayerData, scene: Scene): Promise<CharacterModel> {
        const p = new CharacterModel(data);
        await p.initAsync(scene);
        return p;
    }

    async initAsync(scene: Scene) {
        await SceneLoader.ImportMeshAsync(
            "",
            "/models/steve/",
            "steve2.gltf",
            scene
        ).then((result) => {
            this.model = result.meshes[0]
            this.model.parent = this.node
            this.model.scaling = new Vector3(0.25, 0.25, 0.25)
            this.model.rotation = new Vector3(0, 0, 0)

            // Apply material
            const material = Materials.getPBRMaterial(scene, "steveMaterial", "/models/steve/steve.jpg", false, false,  {
                metallic: 0,
                roughness: 1,
                directIntensity: 1,
                environmentIntensity: 1,
            })
            this.model.getChildMeshes().forEach((mesh) => {
                mesh.material = material
                Renderer.addShadowCaster(mesh)
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

            this.torsoNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.001")!, this.model) // Torso node 001
            this.headNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.002")!, this.model) // Head node 002
            this.larmNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.010")!, this.model) // Larm 010
            this.rarmNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.003")!, this.model) // Rarm 003
            this.llegNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.008")!, this.model) // Lleg 008
            this.rlegNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.006")!, this.model) // Rleg 006
            this.lhandNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.012")!, this.model) // Lhand 012
            this.rhandNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.009")!, this.model) // Rhand 009
        }).catch((error) => {
            console.error("Error loading model:", error)
        });

        this.assignArmor(10, 3)
        this.assignHelmet(20, 3)
        this.assignRightPauldron(40, 0)
        this.assignLeftPauldron(50, 0)
        this.assignRightLeg(60, 0)
        this.assignLeftLeg(60, 0)
        await this.assignWeapon(1)
    }

    assignHelmet(type: number, materialId: number) {
        CharEquipManager.assignHelmet(this.headNode, type, materialId);
    }

    assignArmor(type: number, materialId: number) {
        CharEquipManager.assignArmor(this.torsoNode, type, materialId);
    }

    assignLeftPauldron(type: number, materialId: number) {
        CharEquipManager.assignPauldron(this.rarmNode, type, materialId);
    }

    assignRightPauldron(type: number, materialId: number) {
        CharEquipManager.assignPauldron(this.larmNode, type, materialId);
    }

    assignLeftLeg(type: number, materialId: number) {
        CharEquipManager.assignLeg(this.llegNode, type, materialId);
    }

    assignRightLeg(type: number, materialId: number) {
        CharEquipManager.assignLeg(this.rlegNode, type, materialId);
    }

    async assignWeapon(type: number) {
        await CharEquipManager.assignWeapon(this, this.rhandNode, type);
    }

    startWalkAnimation() {
        if (this.actualAnim !== this.walkAnim) {
            this.transitionToAnimation(this.walkAnim, 0.15, true, 3)
            this.actualAnim = this.walkAnim

            this.actualStepSound = this.getStepSound()
            this.actualStepSound.setPlaybackRate(this.playerData.getStepSoundSpeed())
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
            this.actualStepSound.setPlaybackRate(this.playerData.getStepSoundSpeed())
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
            this.actualStepSound.setPlaybackRate(this.playerData.getStepSoundSpeed())
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
            this.transitionToAnimation(desiredAnimation, 0.15, false, 1000 / this.playerData.attackAnimationTime)
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
        const stepSoundType = this.playerData.getFootStepSoundType()
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
        if (this.playerData.getMoveAngle() != null) {
            this.moveModel(timeRate)
        }
        if (this.playerData.getLookAngle() != null) {
            this.resolveModelRotation(timeRate)
        }
    }

    /**
     * Approximate model Y position to the player Y position
     */
    moveModel(timeRate: number) {
        this.playerData.pos.y += (this.playerData.logicYpos - this.playerData.pos.y) * this.playerData.yMoveSpeed * timeRate

        this.node.markAsDirty("position")
        this.node.computeWorldMatrix(true);
        this.model!.computeWorldMatrix(true);
    }

    /**
     * Rotate model fluently to the look angle
     */
    resolveModelRotation(timeRate: number) {
        const model = this.model!
        const lookAngle = this.playerData.getLookAngle()
        if (lookAngle == null) return

        const rotationSpeed = this.playerData.rotationSpeed * timeRate

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
        this.playerData.modelRotation = model.rotation.y
    }
}
