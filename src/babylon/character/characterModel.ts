import {
    AbstractMesh,
    AnimationGroup, Matrix, Mesh, Quaternion,
    SceneLoader, Skeleton, Sound, TransformNode,
    Vector3,
} from '@babylonjs/core'
import { AudioManager, FootStepSpeeds, FootStepTypes } from '@/babylon/audio/audioManager'
import { Materials } from '@/babylon/materials'
import { AnimTransition } from '@/babylon/animations/animation'
import { Lights } from '@/babylon/scene/lights'
import Character from '@/babylon/character/character'
import { Renderer } from '@/babylon/scene/renderer'
import { MyPlayer } from '@/data/myPlayer'
import { EquipBearer, EquipItem, EquipManager } from '@/babylon/item/equipManager'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemSlots, WeaponTypes } from '@/data/items/item'
import { Utils } from '@/utils/utils'
import { AudioUtils } from '@/babylon/audio/audioUtils'

export class CharacterModel implements EquipBearer {
    parent: Character
    node: TransformNode = new TransformNode("characterModelNode")
    nameTextNode: TransformNode
    initialized: boolean = false

    model: AbstractMesh | undefined
    modelYAngleOffset: number = Math.PI * 1 / 4
    modelRotation: number = 0
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

    greatAxeAttackAnim: AnimationGroup | undefined

    bowAimAnim: AnimationGroup | undefined

    oreMiningAnim: AnimationGroup | undefined
    deathAnim: AnimationGroup | undefined

    actualAnim: AnimationGroup | undefined
    animTransition: AnimTransition | null = null
    deathSink: number = 0
    deathSinkTarget: number = 0

    equipSet: Map<string, EquipItem> = new Map()
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
            "human_male.gltf",
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
            const material = Materials.getPBRMaterial(Renderer.scene, "steveMaterial", "/models/steve/human_male2.png", false, false,  {
                metallic: 0,
                roughness: 1,
                directIntensity: 1,
                environmentIntensity: 1,
            })
            // Keep the player body lit consistently with monster bodies and
            // equipped items under the close indoor light.
            material.twoSidedLighting = true
            material.usePhysicalLightFalloff = false
            this.model.getChildMeshes().forEach((mesh) => {
                mesh.material = material
                Lights.addShadowCaster(mesh)
                Lights.registerActorLightMesh(mesh)
                if (this.parent.isMyChar()) {
                    void Lights.warmLocalPlayerLightMaterial(mesh)
                }
                mesh.receiveShadows = true
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

                    { name: "BowAim", startFrame: 1100, endFrame: 1175},

                    { name: "GreatAxeAttack", startFrame: 1200, endFrame: 1260},

                    { name: "OreMining", startFrame: 1300, endFrame: 1360},
                    { name: "Death", startFrame: 1400, endFrame: 1460},
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
                this.bowAimAnim = newAnimationGroups[10]
                this.greatAxeAttackAnim = newAnimationGroups[11]
                this.oreMiningAnim = newAnimationGroups[12]
                this.deathAnim = newAnimationGroups[13]

                this.idleAnim?.start(true, 0.5)
                this.actualAnim = this.idleAnim
            }
            this.skeleton = result.skeletons[0];
            this.lhandNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.012")!, this.model) // Lhand 012
            this.rhandNode.attachToBone(this.skeleton.bones.find(b => b.id === "Bone.009")!, this.model) // Rhand 009
        }).catch((error) => {
            console.error("Error loading model:", error)
        });

        this.assignEquippedItems()
        this.initialized = true
    }

    assignEquippedItems() {
        if (this.parent.equipSet.get(EquipItemSlots.R_HAND) && !this.equipSet.get("WEAPON")) {
            const weapon = this.parent.equipSet.get(EquipItemSlots.R_HAND)!
            this.assignWeapon(weapon.modelId, weapon.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.BODY) && !this.equipSet.get("BODY")) {
            const armor = this.parent.equipSet.get(EquipItemSlots.BODY)!
            this.assignArmor(armor.modelId, armor.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.HEAD) && !this.equipSet.get("HEAD")) {
            const helmet = this.parent.equipSet.get(EquipItemSlots.HEAD)!
            this.assignHelmet(helmet.modelId, helmet.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.PAULDRONS) && !this.equipSet.get("LEFT_PAULDRON") && !this.equipSet.get("RIGHT_PAULDRON")) {
            const pauldrons = this.parent.equipSet.get(EquipItemSlots.PAULDRONS)!
            this.assignLeftPauldron(pauldrons.modelId, pauldrons.materialId - 1)
            this.assignRightPauldron(pauldrons.modelId, pauldrons.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.LEGS) && !this.equipSet.get("LEFT_LEG") && !this.equipSet.get("RIGHT_LEG")) {
            const legs = this.parent.equipSet.get(EquipItemSlots.LEGS)!
            this.assignLeftLeg(legs.modelId, legs.materialId - 1)
            this.assignRightLeg(legs.modelId, legs.materialId - 1)
        }
    }

    clearAllEquippedItems() {
        this.equipSet.forEach((item) => {
            EquipManager.removeEquippedItem(item)
        })
        this.equipSet.clear()
    }

    assignArmor(type: number, matIndex: number) {
        this.addEquippedItem("BODY", new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.001")!, null, null, null))
    }

    assignHelmet(type: number, matIndex: number) {
        this.addEquippedItem("HEAD", new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.002")!, null, null, null))
    }

    assignLeftPauldron(type: number, matIndex: number) {
        this.addEquippedItem("LEFT_PAULDRON", new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.010")!, null, new Vector3(0, - Math.PI / 2, 0), null))
    }

    assignRightPauldron(type: number, matIndex: number) {
        this.addEquippedItem("RIGHT_PAULDRON", new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.003")!, null, new Vector3(0, Math.PI / 2, 0), new Vector3(0.02, 0, 0.02)))
    }

    assignLeftLeg(type: number, matIndex: number) {
        this.addEquippedItem("LEFT_LEG", new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.008")!, null, null, null))
    }

    assignRightLeg(type: number, matIndex: number) {
        this.addEquippedItem("RIGHT_LEG", new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.006")!, null, null, null))
    }

    assignWeapon(type: number, matIndex: number) {
        this.weaponEquipItem = new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find(b => b.id === "Bone.009")!, null, null, null)
        //this.weaponEquipItem.createSwordParticles(this.rhandNode)
        this.addEquippedItem("WEAPON", this.weaponEquipItem)
    }

    addEquippedItem(slot: string, item: EquipItem) {
        this.equipSet.set(slot, item)
        EquipManager.addEquippedItem(item)
    }

    removeEquippedItem(slot: string) {
        const removeModelSlot = (modelSlot: string) => {
            const item = this.equipSet.get(modelSlot)
            if (!item) {
                return
            }
            EquipManager.removeEquippedItem(item)
            this.equipSet.delete(modelSlot)
        }

        switch (slot) {
            case "HEAD": {
                removeModelSlot("HEAD")
                break
            }
            case "BODY": {
                removeModelSlot("BODY")
                break
            }
            case "R_HAND": {
                this.setWeaponTrailEnabled(false)
                this.disposeWeaponTrail()
                this.weaponEquipItem = null
                removeModelSlot("WEAPON")
                break
            }
            case "L_HAND": {
                removeModelSlot("L_HAND")
                break
            }
            case "PAULDRONS": {
                removeModelSlot("LEFT_PAULDRON")
                removeModelSlot("RIGHT_PAULDRON")
                break
            }
            case "LEGS": {
                removeModelSlot("LEFT_LEG")
                removeModelSlot("RIGHT_LEG")
                break
            }
            case "NECKLACE":
            case "L_RING":
            case "R_RING": {
                break
            }
        }
    }

    onFrame(timeRate: number) {
        this.checkActiveStepSound()

        if (!this.isActive()) return
        if (this.animTransition) {
            this.animTransition.onFrame(timeRate)
            if (this.animTransition.ended) {
                this.animTransition = null
            }
        }

        const hasPositionDrift =
            Math.abs(this.parent.pos.x - this.node.position.x) > 0.001 ||
            Math.abs(this.parent.pos.z - this.node.position.z) > 0.001

        if (this.parent !== MyPlayer.myChar || this.parent.getMoveAngle() != null || hasPositionDrift || Math.abs(this.parent.pos.y - this.parent.logicYpos) > 0.1) {
            this.moveModel(timeRate)
        }
        if (this.parent.getLookAngle() != null) {
            this.resolveModelRotation(timeRate)
        }
        this.resolveDeathSink(timeRate)

        if (this.model) {
            this.rotationQuaternion = new Quaternion()
            this.worldMatrix = this.model!.getWorldMatrix();
            this.worldMatrix.decompose(new Vector3(), this.rotationQuaternion, new Vector3());
        }

        this.equipSet.forEach(item => {
            item.onFrame()
        })
    }

    startWalkAnimation(speedRatio: number) {
        if (!this.isActive()) return
        if (this.actualAnim !== this.walkAnim) {
            this.transitionToAnimation(this.walkAnim, 0.15, true, 3 * speedRatio)
            this.actualAnim = this.walkAnim
        }
    }

    startRunAnimation(speedRatio: number) {
        if (!this.isActive()) return
        if (this.actualAnim !== this.runAnim) {
            this.transitionToAnimation(this.runAnim, 0.15, true, 3 * speedRatio)
            this.actualAnim = this.runAnim
        }
    }

    doAttackAnimation() {
        if (!this.isActive()) return
        let baseAnimSpeed = 1000
        const possibleAnims = []
        if (this.parent.getWeapon() != null) {
            switch (this.parent.getWeapon()!.slotInfo.weaponType) {
                case WeaponTypes.SWORD: {
                    possibleAnims.push(this.slashAnim)
                    possibleAnims.push(this.slashAnim2)
                    possibleAnims.push(this.leftSlashAnim)
                    possibleAnims.push(this.rightSlashAnim)
                    possibleAnims.push(this.jabAnim)
                    possibleAnims.push(this.highJabAnim)
                    break
                }
                case WeaponTypes.PICKAXE: {
                    possibleAnims.push(this.greatAxeAttackAnim)
                    break
                }
                case WeaponTypes.BOW: {
                    possibleAnims.push(this.bowAimAnim)
                    baseAnimSpeed = 1150
                    this.bowAimAnim!.onAnimationEndObservable.addOnce(() => {
                        const a = this.bowAimAnim!
                        a.start(true, 1, a.to, a.to)
                        a.setWeightForAllAnimatables(1)
                    })
                    break
                }
                default: {
                    possibleAnims.push(this.slashAnim)
                    break
                }
            }
        }

        const anim = possibleAnims[Utils.rollDice(possibleAnims.length, true)]
        if (this.actualAnim !== anim) {
            this.transitionToAnimation(anim, 0.15, false, baseAnimSpeed / this.parent.attackAnimationTime)
            this.actualAnim = anim
        }
    }

    doOreMiningAnimation() {
        if (!this.isActive()) return
        if (!this.oreMiningAnim) return

        const speed = 1000 / this.parent.attackAnimationTime
        if (this.actualAnim !== this.oreMiningAnim) {
            this.transitionToAnimation(this.oreMiningAnim, 0.15, false, speed)
            this.actualAnim = this.oreMiningAnim
        }
    }

    doLumberJackingAnimation() {
        // For now, lumberjacking uses the same animation as ore mining
        if (!this.isActive()) return
        if (!this.oreMiningAnim) return

        const speed = 1000 / this.parent.attackAnimationTime
        if (this.actualAnim !== this.oreMiningAnim) {
            this.transitionToAnimation(this.oreMiningAnim, 0.15, false, speed)
            this.actualAnim = this.oreMiningAnim
        }
    }

    stopAnimation() {
        const desiredAnimation = this.parent.isRecentlyInCombat() ? this.combatIdleAnim : this.idleAnim
        const animSpeed = desiredAnimation === this.combatIdleAnim ? 0.75 : 0.5

        if (this.actualAnim !== desiredAnimation) {
            this.transitionToAnimation(desiredAnimation, 0.25, true, animSpeed)
            this.actualAnim = desiredAnimation
        }
    }

    playDeathAnimation() {
        if (!this.isActive() || !this.deathAnim) {
            return
        }
        this.animTransition?.forceEnd()
        this.animTransition = null
        this.actualAnim?.stop()
        this.deathSink = 0
        this.deathSinkTarget = 0
        this.model!.position.y = 0
        this.deathAnim.stop()
        this.deathAnim.start(false, 1, this.deathAnim.from, this.deathAnim.to)
        this.deathAnim.onAnimationEndObservable.addOnce(() => {
            if (this.parent.dead) {
                this.deathAnim!.start(true, 1, this.deathAnim!.to, this.deathAnim!.to)
                this.deathAnim!.setWeightForAllAnimatables(1)
                this.deathSinkTarget = 0.1
            }
        })
        this.actualAnim = this.deathAnim
    }

    clearDeathPose() {
        this.deathSink = 0
        this.deathSinkTarget = 0
        if (this.model) {
            this.model.position.y = 0
        }
    }

    private resolveDeathSink(timeRate: number) {
        if (!this.model || this.deathSink >= this.deathSinkTarget) {
            return
        }
        this.deathSink = Math.min(this.deathSinkTarget, this.deathSink + timeRate * 0.4)
        this.model.position.y = -this.deathSink
    }

    checkActiveStepSound() {
        // No movement, stop all step sounds
        if (this.parent.getMoveAngle() == null) {
            this.stopAllStepSounds()
            this.actualStepSound = null
            return
        }

        const supposedStepSound = this.getStepSoundByTerrain()
        if (this.actualStepSound !== supposedStepSound) {
            this.actualStepSound = supposedStepSound
        }
        const soundParams = this.getStepSoundParams()
        this.actualStepSound.setPlaybackRate(soundParams.speed)
        if (!this.actualStepSound.isPlaying) {
            this.actualStepSound.play()
        }

        this.actualStepSound.setVolume(soundParams.volume)
        this.stopAllStepSounds(this.actualStepSound)
    }

    getStepSoundByTerrain(): Sound {
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

    getStepSoundParams(): {speed: number, volume: number} {
        let speed = 1
        let volume = 1
        const stepSpeedRatio = this.parent.getMoveType() === 'R' ? this.parent.getActualSpeed() / 3.2 : this.parent.getActualSpeed() / 2

        switch (this.parent.getFootStepSoundType()) {
            case 'DIRT':
                speed = this.parent.getMoveType() === 'R' ? FootStepSpeeds.DIRT_RUN : FootStepSpeeds.DIRT_WALK
                volume = AudioManager.footStepSounds.get(FootStepTypes.DIRT).defaultVolume
                break
            case 'SNOW':
                speed = this.parent.getMoveType() === 'R' ? FootStepSpeeds.SNOW_RUN : FootStepSpeeds.SNOW_WALK
                volume = AudioManager.footStepSounds.get(FootStepTypes.SNOW).defaultVolume
                break
            case 'WATER':
                speed = this.parent.getMoveType() === 'R' ? FootStepSpeeds.WATER_RUN : FootStepSpeeds.WATER_WALK
                volume = AudioManager.footStepSounds.get(FootStepTypes.WATER).defaultVolume
                break
            default:
                speed = this.parent.getMoveType() === 'R' ? FootStepSpeeds.DIRT_RUN : FootStepSpeeds.DIRT_WALK
                volume = AudioManager.footStepSounds.get(FootStepTypes.DIRT).defaultVolume
                break
        }
        volume = Math.max(0, volume * (this.parent.isMyChar() ? 1 : AudioUtils.getVolumeRatioByDistance(this.parent.pos)))
        return { speed: speed * stepSpeedRatio, volume: volume * stepSpeedRatio }
    }

    transitionToAnimation(targetAnim: AnimationGroup | undefined, duration: number, loop = false, speed = 1.0) {
        if (!this.isActive()) return
        if (!targetAnim || this.actualAnim === targetAnim) return;

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

    /**
     * Approximate model to the player position
     */
    moveModel(timeRate: number) {
        const approximationSpeed = this.parent == MyPlayer.myChar ? 12 : 8
        this.node.position.x += (this.parent.pos.x - this.node.position.x) * approximationSpeed * timeRate
        this.node.position.z += (this.parent.pos.z - this.node.position.z) * approximationSpeed * timeRate
        this.node.position.y += (this.parent.logicYpos - this.node.position.y) * this.parent.yMoveSpeed * timeRate
        this.parent.pos.y = this.node.position.y

        this.node.markAsDirty("position")
        this.node.computeWorldMatrix(true);

        if (this.model) {
            this.model.computeWorldMatrix(true);
        }
    }

    snapToParentPosition() {
        if (!this.isActive()) {
            return
        }
        this.node.position.x = this.parent.pos.x
        this.node.position.y = this.parent.logicYpos
        this.node.position.z = this.parent.pos.z
        this.node.markAsDirty("position")
        this.node.computeWorldMatrix(true)
        this.model?.computeWorldMatrix(true)
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
        this.modelRotation = model.rotation.y
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

    isActive(): boolean {
        return this.parent.insideView && this.initialized
    }

    async addToView() {
        if (!this.initialized) await this.initAsync()
        if (this.parent.dead) this.playDeathAnimation()
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
        this.model?.getChildMeshes().forEach(mesh => Lights.unregisterActorLightMesh(mesh))
        this.model?.dispose()
        this.node.dispose()
        this.disposeWeaponTrail()
    }
}
