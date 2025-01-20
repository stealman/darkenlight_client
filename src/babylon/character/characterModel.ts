import {
    AbstractMesh,
    AnimationGroup,
    Scene,
    SceneLoader, Skeleton, Sound, TransformNode,
    Vector3,
} from '@babylonjs/core'
import { Settings } from '@/settings/settings'
import { AudioManager } from '@/babylon/audio/audioManager'
import { Materials } from '@/babylon/materials'
import { WearableManager } from '@/babylon/item/wearableManager'
import { PlayerData } from '@/data/playerData'
import { AnimTransition } from '@/babylon/animations/animation'
import { Renderer } from '@/babylon/renderer'

export class CharacterModel {
    playerData: PlayerData

    model: AbstractMesh
    modelYAngleOffset: number = Math.PI * 1 / 4
    skeleton: Skeleton
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
    animTransition: AnimTransition | null

    footStepSound: Sound | null

    constructor(playerData: PlayerData, scene: Scene) {
        this.playerData = playerData
        this.footStepSound = AudioManager.footStep.clone()

        SceneLoader.ImportMeshAsync(
            "",
            "/assets/models/steve/",
            "steve.gltf",
            scene
        ).then((result) => {
            this.model = result.meshes[0]
            this.model.scaling = new Vector3(0.25, 0.25, 0.25)
            this.model.rotation = new Vector3(0, 0, 0)

            // Apply material
            const material = Materials.getBasicMaterial(scene, "steveMaterial", "/assets/models/steve/steve.jpg", false, false)
            this.model.getChildMeshes().forEach((mesh) => {
                mesh.material = material
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

            this.torsoNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.001"), this.model) // Torso node 001
            this.headNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.002"), this.model) // Head node 002
            this.larmNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.010"), this.model) // Larm 010
            this.rarmNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.003"), this.model) // Rarm 003
            this.llegNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.008"), this.model) // Lleg 008
            this.rlegNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.006"), this.model) // Rleg 006
            this.lhandNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.012"), this.model) // Lhand 012
            this.rhandNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.009"), this.model) // Rhand 009

            this.assignArmor(1, 1)
            this.assignHelmet(1, 1)
            this.assignRightPauldron(1, 1)
            this.assignLeftPauldron(2, 1)
            this.assignRightLeg(1, 1)
            this.assignLeftLeg(1, 1)
            this.assignSword(1, 1)

        }).catch((error) => {
            console.error("Error loading model:", error)
        });
    }

    assignHelmet(type, materialId) {
        WearableManager.assignHelmet(this.headNode, type, materialId);
    }

    assignArmor(type, materialId) {
        WearableManager.assignArmor(this.torsoNode, type, materialId);
    }

    assignLeftPauldron(type, materialId) {
        WearableManager.assignPauldron(this.rarmNode, type, materialId);
    }

    assignRightPauldron(type, materialId) {
        WearableManager.assignPauldron(this.larmNode, type, materialId);
    }

    assignLeftLeg(type, materialId) {
        WearableManager.assignLeg(this.llegNode, type, materialId);
    }

    assignRightLeg(type, materialId) {
        WearableManager.assignLeg(this.rlegNode, type, materialId);
    }

    assignSword(type, materialId) {
        WearableManager.assignSword(this.rhandNode, type, materialId);
    }

    startWalkAnimation() {
        if (this.actualAnim !== this.walkAnim) {
            this.transitionToAnimation(this.walkAnim, 0.15, true, 3)
            this.actualAnim = this.walkAnim

            this.footStepSound?.setPlaybackRate(0.70)
            if (!this.footStepSound?.isPlaying) {
                this.footStepSound?.play()
            }
        }
    }

    startRunAnimation() {
        if (this.actualAnim !== this.runAnim) {
            this.transitionToAnimation(this.runAnim, 0.15, true, 3)
            this.actualAnim = this.runAnim

            this.footStepSound?.setPlaybackRate(0.78)
            if (!this.footStepSound?.isPlaying) {
                this.footStepSound?.play()
            }
        }
    }

    doAttackAnimation() {
        // Random select attack animation
        const desiredAnimation = [this.slashAnim, this.jabAnim, this.leftSlashAnim, this.rightSlashAnim, this.highJabAnim, this.slashAnim2][Math.floor(Math.random() * 6)]
        if (this.actualAnim !== desiredAnimation) {
            this.transitionToAnimation(desiredAnimation, 0.15, false, 1.25)
            this.actualAnim = desiredAnimation

            if (this.footStepSound?.isPlaying) {
                this.footStepSound?.stop()
            }
        }
    }

    stopAnimation() {
        const desiredAnimation = this.combatIdleAnim
        const animSpeed = 0.75

        if (this.actualAnim !== desiredAnimation) {
            this.transitionToAnimation(desiredAnimation, 0.25, true, animSpeed)
            this.actualAnim = desiredAnimation
        }

        if (this.footStepSound?.isPlaying) {
            this.footStepSound?.stop()
        }
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

        if (this.playerData.moveAngle != null) {
            this.resolveModelYpos(timeRate)
            this.resolveModelRotation(timeRate)
        }
    }

    /**
     * Approximate model Y position to the player Y position
     */
    resolveModelYpos(timeRate: number) {
        this.playerData.modelYpos += (this.playerData.yPos - this.playerData.modelYpos) * this.playerData.yMoveSpeed * timeRate
    }

    /**
     * Approximate model rotation to the move angle
     */
    resolveModelRotation(timeRate: number) {
        const myAngle = this.model.rotation.y - this.modelYAngleOffset

        let angleDifference = this.playerData.moveAngle - myAngle;
        const rotationSpeed = this.playerData.rotationSpeed * timeRate;
        if (angleDifference > Math.PI) {
            angleDifference -= 2 * Math.PI;
        } else if (angleDifference < -Math.PI) {
            angleDifference += 2 * Math.PI;
        }

        if (Math.abs(angleDifference) < rotationSpeed) {
            this.model.rotation.y = this.playerData.moveAngle ? this.playerData.moveAngle + this.modelYAngleOffset : 0;
        } else {
            this.model.rotation.y += Math.sign(angleDifference) * rotationSpeed;
        }
        this.playerData.modelRotation = this.model.rotation.y;
    }
}
