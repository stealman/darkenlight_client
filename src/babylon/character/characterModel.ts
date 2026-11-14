import {
    AbstractMesh, AssetContainer, Color3,
    AnimationGroup, Matrix, Mesh, Quaternion, TargetedAnimation,
    InstantiatedEntries, Observer, Scene, SceneLoader, Skeleton, Sound, TransformNode,
    Vector3,
} from '@babylonjs/core'
import { AudioManager, FootStepSpeeds, FootStepTypes } from '@/babylon/audio/audioManager'
import { Materials } from '@/babylon/materials'
import { AnimTransition } from '@/babylon/animations/animation'
import { Lights } from '@/babylon/scene/lights'
import type Character from '@/babylon/character/character'
import { MyPlayer } from '@/data/myPlayer'
import { EquipBearer, EquipItem, EquipManager } from '@/babylon/item/equipManager'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemSlots, EquipSlotModelsCb, WeaponCategories, WeaponTypes } from '@/data/items/item'
import { Utils } from '@/utils/utils'
import { AudioUtils } from '@/babylon/audio/audioUtils'
import { getCharacterModelEquipModifier } from '@/babylon/character/characterModelEquipModifiers'
import { Settings } from '@/settings/settings'
import { ActiveMeshFreezer } from '@/babylon/scene/activeMeshFreezer'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { HUMAN_MODEL_FILE, HUMAN_ANIMATION_SPEED, getHumanAnimationRange, prepareHumanSkeleton } from './humanModelRig'
import { applyCharacterEquipmentFitting, preloadCharacterEquipmentFitting } from './characterEquipmentFitting'

export class CharacterModel implements EquipBearer {
    private static readonly MODEL_FILE = HUMAN_MODEL_FILE
    private static readonly preparedModelCount = 6
    private static readonly maxReusableModels = 8
    private static containerPromises = new WeakMap<Scene, Promise<AssetContainer>>()
    private static preparedModels = new WeakMap<Scene, InstantiatedEntries[]>()
    private static preparedAnimations = new WeakMap<InstantiatedEntries, AnimationGroup[]>()

    parent: Character
    node: TransformNode = new TransformNode('characterModelNode')
    nameTextNode: TransformNode
    initialized: boolean = false
    viewRequested: boolean = false

    model: AbstractMesh | undefined
    private instantiatedEntries: InstantiatedEntries | null = null
    private initializationPromise: Promise<void> | null = null
    private bowAimEndObserver: Observer<TargetedAnimation> | null = null
    modelYAngleOffset: number = (Math.PI * 1) / 4
    modelRotation: number = 0
    worldMatrix: Matrix = Matrix.Identity()
    rotationQuaternion: Quaternion = Quaternion.Identity()

    skeleton: Skeleton | undefined
    lhandNode: TransformNode = new TransformNode('lhandNode')
    rhandNode: TransformNode = new TransformNode('rhandNode')

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
    twoHandedSwordAttackAnim: AnimationGroup | undefined
    twoHandedSwordAttackAnim2: AnimationGroup | undefined
    twoHandedSpearAttackAnim: AnimationGroup | undefined

    bowAimAnim: AnimationGroup | undefined

    oreMiningAnim: AnimationGroup | undefined
    deathAnim: AnimationGroup | undefined

    actualAnim: AnimationGroup | undefined
    animTransition: AnimTransition | null = null
    idleAnimationFrozen: boolean = false
    deathSink: number = 0
    deathSinkTarget: number = 0

    equipSet: Map<string, EquipItem> = new Map()
    weaponEquipItem: EquipItem | null = null

    actualStepSound: Sound | null = null
    footStepSounds: Map<string, Sound> = new Map()

    constructor(parent: Character) {
        this.parent = parent
        this.node.position.copyFrom(this.parent.pos)
        this.nameTextNode = new TransformNode('nameTextNode' + this.parent.id)
    }

    static async create(data: Character, init: boolean, entries?: InstantiatedEntries): Promise<CharacterModel> {
        const model = new CharacterModel(data)
        if (entries) model.instantiatedEntries = entries
        if (init) await model.initAsync()
        return model
    }

    static async preload(scene: Scene) {
        const container = await this.getContainer(scene)
        let pool = this.preparedModels.get(scene)
        if (pool == null) {
            pool = []
            this.preparedModels.set(scene, pool)
        }
        while (pool.length < this.preparedModelCount) {
            const entries = container.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
            entries.rootNodes[0]?.setEnabled(false)
            pool.push(entries)
        }
    }

    private static getContainer(scene: Scene): Promise<AssetContainer> {
        let promise = this.containerPromises.get(scene)
        if (promise == null) {
            promise = Promise.all([
                SceneLoader.LoadAssetContainerAsync('', modelAssetUrl('/models/steve/' + this.MODEL_FILE), scene),
                preloadCharacterEquipmentFitting(scene),
            ]).then(([container]) => container)
            this.containerPromises.set(scene, promise)
        }
        return promise
    }

    private static async instantiate(scene: Scene): Promise<InstantiatedEntries> {
        const container = await this.getContainer(scene)
        const pool = this.preparedModels.get(scene)
        const entries = pool?.pop()
            ?? container.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
        entries.rootNodes[0]?.setEnabled(true)
        return entries
    }

    private static release(scene: Scene, entries: InstantiatedEntries) {
        // Animation observers owned by the outgoing character must be removed
        // before stopping groups (stop can notify animation-end observers).
        entries.animationGroups.forEach(animation => {
            animation.stop()
            animation.setWeightForAllAnimatables(0)
            animation.speedRatio = 1
        })
        entries.rootNodes.forEach(node => {
            node.setEnabled(false)
            node.parent = null
            if (node instanceof TransformNode) node.position.setAll(0)
        })
        let pool = this.preparedModels.get(scene)
        if (!pool) {
            pool = []
            this.preparedModels.set(scene, pool)
        }
        if (!scene.isDisposed && pool.length < this.maxReusableModels) {
            pool.push(entries)
        } else {
            this.preparedAnimations.delete(entries)
            entries.dispose()
        }
    }

    initAsync(): Promise<void> {
        if (this.initialized || this.node.isDisposed()) return Promise.resolve()
        if (!this.initializationPromise) {
            this.initializationPromise = this.initializeModelAsync().finally(() => {
                this.initializationPromise = null
            })
        }
        return this.initializationPromise
    }

    private async initializeModelAsync() {
        const scene = this.node.getScene()
        // The shared AssetContainer parses the GLB once. Most nearby human
        // models are instantiated behind the loading overlay and only enabled
        // when their character first enters the viewport.
        await (this.instantiatedEntries ? Promise.resolve(this.instantiatedEntries) : CharacterModel.instantiate(scene))
            .then((result) => {
                if (this.node.isDisposed()) {
                    CharacterModel.release(scene, result)
                    return
                }
                this.instantiatedEntries = result
                this.model = result.rootNodes[0] as AbstractMesh
                this.model.parent = this.node
                // Preserve the glTF root's handedness conversion.
                this.model.scaling = new Vector3(0.3, 0.28, -0.3)
                this.model.rotation = new Vector3(0, 0, 0)

                this.nameTextNode.parent = this.node
                this.nameTextNode.position.y = this.parent.getModelHeight()
                this.parent.nameDisplayTime = Date.now() + 3000

                // Apply material
                const material = Materials.getPBRMaterial(scene, 'steveMaterial', '/models/steve/human_male.png', false, false, {
                    metallic: 0,
                    roughness: 1,
                    directIntensity: 1,
                    environmentIntensity: 1,
                })
                // Keep the player body lit consistently with monster bodies and
                // equipped items under the close indoor light.
                material.twoSidedLighting = true
                material.usePhysicalLightFalloff = false
                if (this.parent.isMyChar()) {
                    material.emissiveTexture = material.albedoTexture
                    material.emissiveColor = new Color3(0.15, 0.15, 0.15)
                }
                this.model.getChildMeshes().forEach((mesh) => {
                    mesh.material = material
                    Lights.addShadowCaster(mesh, true, false, true)
                    Lights.registerActorLightMesh(mesh)
                    if (this.parent.isMyChar()) {
                        void Lights.warmLocalPlayerLightMaterial(mesh)
                    }
                    mesh.receiveShadows = true
                })

                // Process animations
                if (result.animationGroups.length > 0) {
                    const animationGroup = result.animationGroups[0] // Assuming there is one animation group
                    animationGroup.stop()

                    // Unauthored actions keep separate groups but temporarily sample JAB.
                    const animations = [
                        'Idle', 'Walk', 'Run', 'CombatIdle', 'Slash', 'Jab',
                        'LeftSlash', 'RightSlash', 'HighJab', 'Slash2', 'BowAim',
                        'GreatAxeAttack', 'OreMining', 'Death', 'TwoHandedSwordAttack',
                        'TwoHandedSwordAttack2', 'TwoHandedSpearAttack',
                    ].map(name => ({ name, ...getHumanAnimationRange(name) }))

                    let newAnimationGroups = CharacterModel.preparedAnimations.get(result)
                    if (!newAnimationGroups) {
                        newAnimationGroups = animations.map(({ name, startFrame, endFrame }) => {
                            const newGroup = animationGroup.clone(name)
                            newGroup.from = startFrame
                            newGroup.to = endFrame
                            return newGroup
                        })
                        result.animationGroups.push(...newAnimationGroups)
                        CharacterModel.preparedAnimations.set(result, newAnimationGroups)
                    }

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
                    // One observer per model, rather than one per attack.
                    // Interrupted shots must not accumulate pending callbacks.
                    this.bowAimEndObserver = this.bowAimAnim.onAnimationEndObservable.add(() => {
                        if (this.actualAnim !== this.bowAimAnim || !this.isActive() || this.parent.dead) return
                        const animation = this.bowAimAnim!
                        animation.start(true, 1, animation.to, animation.to)
                        animation.setWeightForAllAnimatables(1)
                    })
                    this.greatAxeAttackAnim = newAnimationGroups[11]
                    this.oreMiningAnim = newAnimationGroups[12]
                    this.deathAnim = newAnimationGroups[13]
                    this.twoHandedSwordAttackAnim = newAnimationGroups[14]
                    this.twoHandedSwordAttackAnim2 = newAnimationGroups[15]
                    this.twoHandedSpearAttackAnim = newAnimationGroups[16]

                    this.idleAnim?.start(true, HUMAN_ANIMATION_SPEED.idle)
                    this.actualAnim = this.idleAnim
                }
                this.skeleton = result.skeletons[0]
                prepareHumanSkeleton(this.skeleton)
                this.lhandNode.attachToBone(this.skeleton.bones.find((b) => b.id === 'Bone.012')!, this.model) // Lhand 012
                this.rhandNode.attachToBone(this.skeleton.bones.find((b) => b.id === 'Bone.009')!, this.model) // Rhand 009
            })
            .catch((error) => {
                console.error('Error loading model:', error)
            })

        if (this.node.isDisposed()) return
        if (this.model) {
            this.worldMatrix.copyFrom(this.model.computeWorldMatrix(true))
            this.worldMatrix.decompose(undefined, this.rotationQuaternion)
        }
        this.assignEquippedItems()
        this.initialized = true
        this.snapToParentPosition()
        if (this.parent.insideView) {
            ActiveMeshFreezer.setSkeletonActive(this.skeleton, true)
        }
    }

    assignEquippedItems() {
        if (this.parent.equipSet.get(EquipItemSlots.R_HAND) && !this.equipSet.get('WEAPON')) {
            const weapon = this.parent.equipSet.get(EquipItemSlots.R_HAND)!
            this.assignWeapon(weapon.modelId, weapon.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.L_HAND) && !this.equipSet.get('SHIELD')) {
            const shield = this.parent.equipSet.get(EquipItemSlots.L_HAND)!
            this.assignShield(shield.modelId, shield.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.BODY) && !this.equipSet.get('BODY')) {
            const armor = this.parent.equipSet.get(EquipItemSlots.BODY)!
            this.assignArmor(armor.modelId, armor.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.HEAD) && !this.equipSet.get('HEAD')) {
            const helmet = this.parent.equipSet.get(EquipItemSlots.HEAD)!
            this.assignHelmet(helmet.modelId, helmet.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.PAULDRONS) && !this.equipSet.get('LEFT_PAULDRON') && !this.equipSet.get('RIGHT_PAULDRON')) {
            const pauldrons = this.parent.equipSet.get(EquipItemSlots.PAULDRONS)!
            this.assignLeftPauldron(pauldrons.modelId, pauldrons.materialId - 1)
            this.assignRightPauldron(pauldrons.modelId, pauldrons.materialId - 1)
        }

        if (this.parent.equipSet.get(EquipItemSlots.LEGS) && !this.equipSet.get('LEFT_LEG') && !this.equipSet.get('RIGHT_LEG')) {
            const legs = this.parent.equipSet.get(EquipItemSlots.LEGS)!
            this.assignLeftLeg(legs.modelId, legs.materialId - 1)
            this.assignRightLeg(legs.modelId, legs.materialId - 1)
        }
    }

    clearAllEquippedItems() {
        this.equipSet.forEach((item) => {
            EquipManager.removeEquippedItem(item)
            item.disposeWeaponTrail()
        })
        this.equipSet.clear()
        this.weaponEquipItem = null
    }

    assignArmor(type: number, matIndex: number) {
        this.addEquippedItem('BODY', new EquipItem(EquipManager.getItemType(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.001')!, null, null, null, getCharacterModelEquipModifier(type)))
    }

    assignHelmet(type: number, matIndex: number) {
        this.addEquippedItem('HEAD', new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.002')!, null, null, null, getCharacterModelEquipModifier(type)))
    }

    assignLeftPauldron(type: number, matIndex: number) {
        this.addEquippedItem(
            'LEFT_PAULDRON',
            new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.010')!, null, new Vector3(0, -Math.PI / 2, 0), null, getCharacterModelEquipModifier(type, 'left')),
        )
    }

    assignRightPauldron(type: number, matIndex: number) {
        const mirrorScale = type === EquipSlotModelsCb.PAULDRONS_PLATE.modelId || type === EquipSlotModelsCb.CHAIN_PAULDRONS.modelId
            ? new Vector3(1, 1, -1)
            : null
        this.addEquippedItem(
            'RIGHT_PAULDRON',
            new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.003')!, mirrorScale, new Vector3(0, Math.PI / 2, 0), new Vector3(0.02, 0, 0.02), getCharacterModelEquipModifier(type, 'right')),
        )
    }

    assignLeftLeg(type: number, matIndex: number) {
        const mirrorScale = type === EquipSlotModelsCb.LEGS_PLATE.modelId || type === EquipSlotModelsCb.CHAIN_GREAVES.modelId
            ? new Vector3(1, 1, -1)
            : null
        this.addEquippedItem('LEFT_LEG', new EquipItem(EquipManager.getItemType(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.008')!, mirrorScale, null, null, getCharacterModelEquipModifier(type)))
    }

    assignRightLeg(type: number, matIndex: number) {
        this.addEquippedItem('RIGHT_LEG', new EquipItem(EquipManager.getItemType(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.006')!, null, null, null, getCharacterModelEquipModifier(type)))
    }

    assignWeapon(type: number, matIndex: number) {
        this.weaponEquipItem = new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.009')!, null, null, null, getCharacterModelEquipModifier(type))
        //this.weaponEquipItem.createSwordParticles(this.rhandNode)
        this.addEquippedItem('WEAPON', this.weaponEquipItem)
    }

    assignShield(type: number, matIndex: number) {
        this.addEquippedItem('SHIELD', new EquipItem(EquipManager.itemTypes.get(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.012')!, null, null, null, getCharacterModelEquipModifier(type)))
    }

    addEquippedItem(slot: string, item: EquipItem) {
        applyCharacterEquipmentFitting(this.node.getScene(), slot, item)
        item.castsOutdoorShadow = this.parent.isMyChar() && (slot === 'WEAPON' || slot === 'SHIELD')
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
            case 'HEAD': {
                removeModelSlot('HEAD')
                break
            }
            case 'BODY': {
                removeModelSlot('BODY')
                break
            }
            case 'R_HAND': {
                this.setWeaponTrailEnabled(false)
                this.disposeWeaponTrail()
                this.weaponEquipItem = null
                removeModelSlot('WEAPON')
                break
            }
            case 'L_HAND': {
                removeModelSlot('SHIELD')
                break
            }
            case 'PAULDRONS': {
                removeModelSlot('LEFT_PAULDRON')
                removeModelSlot('RIGHT_PAULDRON')
                break
            }
            case 'LEGS': {
                removeModelSlot('LEFT_LEG')
                removeModelSlot('RIGHT_LEG')
                break
            }
            case 'NECKLACE':
            case 'L_RING':
            case 'R_RING': {
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

        const hasPositionDrift = Math.abs(this.parent.pos.x - this.node.position.x) > 0.001 || Math.abs(this.parent.pos.z - this.node.position.z) > 0.001

        if (this.parent !== MyPlayer.myChar || this.parent.getMoveAngle() != null || hasPositionDrift || Math.abs(this.parent.pos.y - this.parent.logicYpos) > 0.1) {
            this.moveModel(timeRate)
        }
        if (this.parent.getLookAngle() != null) {
            this.resolveModelRotation(timeRate)
        }
        this.resolveDeathSink(timeRate)

        if (this.model) {
            this.worldMatrix = this.model!.getWorldMatrix()
            this.worldMatrix.decompose(undefined, this.rotationQuaternion, undefined)
        }

        this.equipSet.forEach((item) => {
            item.onFrame()
        })
    }

    startWalkAnimation(speedRatio: number) {
        if (!this.isActive()) return
        const speed = HUMAN_ANIMATION_SPEED.walk * speedRatio
        if (this.actualAnim !== this.walkAnim) {
            this.transitionToAnimation(this.walkAnim, 0.15, true, speed)
            this.actualAnim = this.walkAnim
        } else if (this.walkAnim && !this.walkAnim.isPlaying) {
            this.idleAnimationFrozen = false
            this.walkAnim.start(true, speed, this.walkAnim.from, this.walkAnim.to)
            this.walkAnim.setWeightForAllAnimatables(1)
        }
    }

    startRunAnimation(speedRatio: number) {
        if (!this.isActive()) return
        const speed = HUMAN_ANIMATION_SPEED.run * speedRatio
        if (this.actualAnim !== this.runAnim) {
            this.transitionToAnimation(this.runAnim, 0.15, true, speed)
            this.actualAnim = this.runAnim
        } else if (this.runAnim && !this.runAnim.isPlaying) {
            this.idleAnimationFrozen = false
            this.runAnim.start(true, speed, this.runAnim.from, this.runAnim.to)
            this.runAnim.setWeightForAllAnimatables(1)
        }
    }

    doAttackAnimation() {
        if (!this.isActive()) return
        let baseAnimSpeed = 1000
        const possibleAnims = []
        const weapon = this.parent.getWeapon()
        if (weapon != null) {
            const weaponType = weapon.slotInfo?.weaponType
            const usesHeavyTwoHandedAnimations =
                weaponType === WeaponTypes.TWO_HANDED_SWORD ||
                weaponType === WeaponTypes.TWO_HANDED_POLEARM ||
                weaponType === WeaponTypes.TWO_HANDED_MACE ||
                (weapon.weaponCategory === WeaponCategories.AXE && weapon.isTwoHanded() && weaponType !== WeaponTypes.PICKAXE)

            if (weapon.modelId === EquipSlotModelsCb.WAR_SPEAR.modelId) {
                possibleAnims.push(this.twoHandedSpearAttackAnim)
            } else if (usesHeavyTwoHandedAnimations) {
                possibleAnims.push(this.greatAxeAttackAnim)
                possibleAnims.push(this.twoHandedSwordAttackAnim)
                possibleAnims.push(this.twoHandedSwordAttackAnim2)
            } else {
                switch (weaponType) {
                    case WeaponTypes.SWORD: {
                        possibleAnims.push(this.slashAnim)
                        possibleAnims.push(this.slashAnim2)
                        possibleAnims.push(this.leftSlashAnim)
                        possibleAnims.push(this.rightSlashAnim)
                        possibleAnims.push(this.jabAnim)
                        possibleAnims.push(this.highJabAnim)
                        break
                    }
                    case WeaponTypes.MACE: {
                        possibleAnims.push(this.slashAnim)
                        possibleAnims.push(this.slashAnim2)
                        possibleAnims.push(this.leftSlashAnim)
                        possibleAnims.push(this.rightSlashAnim)
                        break
                    }
                    case WeaponTypes.POLEARM: {
                        possibleAnims.push(this.jabAnim)
                        possibleAnims.push(this.highJabAnim)
                        possibleAnims.push(this.rightSlashAnim)
                        break
                    }
                    case WeaponTypes.AXE: {
                        possibleAnims.push(this.slashAnim)
                        possibleAnims.push(this.slashAnim2)
                        possibleAnims.push(this.leftSlashAnim)
                        //possibleAnims.push(this.rightSlashAnim)
                        break
                    }
                    case WeaponTypes.PICKAXE: {
                        possibleAnims.push(this.greatAxeAttackAnim)
                        break
                    }
                    case WeaponTypes.BOW: {
                        possibleAnims.push(this.bowAimAnim)
                        baseAnimSpeed = 1150
                        break
                    }
                    default: {
                        possibleAnims.push(this.slashAnim)
                        break
                    }
                }
            }
        }

        const anim = possibleAnims[Utils.rollDice(possibleAnims.length, true)]
        if (!anim) return

        const speed = baseAnimSpeed / this.parent.attackAnimationTime
        if (this.actualAnim === anim) {
            // Consecutive attacks may legitimately use the same clip (notably Power Strike -> AA).
            // Restart it explicitly; the generic transition guard deliberately ignores the same clip.
            this.animTransition?.forceEnd()
            this.animTransition = null
            anim.stop()
            anim.start(false, speed, anim.from, anim.to)
            anim.setWeightForAllAnimatables(1)
            return
        }

        this.transitionToAnimation(anim, 0.15, false, speed)
        this.actualAnim = anim
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
        // The server's action timer can end before the full authored clip.
        // Keep its existing playback tempo and finish it before returning to a standing pose.
        // Movement and a new attack can still interrupt it through their normal transitions.
        if (this.actualAnim?.isPlaying && !this.actualAnim.loopAnimation) return

        const desiredAnimation = this.parent.isRecentlyInCombat() ? this.combatIdleAnim : this.idleAnim
        const animSpeed = desiredAnimation === this.combatIdleAnim ? HUMAN_ANIMATION_SPEED.combatIdle : HUMAN_ANIMATION_SPEED.idle

        if (!desiredAnimation) return

        if (!this.shouldAnimateIdle()) {
            if (this.idleAnimationFrozen && this.actualAnim === desiredAnimation) return

            this.animTransition?.forceEnd()
            this.animTransition = null
            this.actualAnim?.stop()
            desiredAnimation.stop()
            desiredAnimation.start(true, animSpeed, desiredAnimation.from, desiredAnimation.to)
            desiredAnimation.goToFrame(desiredAnimation.from)
            desiredAnimation.setWeightForAllAnimatables(1)
            desiredAnimation.pause()
            this.actualAnim = desiredAnimation
            this.idleAnimationFrozen = true
            return
        }

        if (this.idleAnimationFrozen) {
            this.idleAnimationFrozen = false
            if (this.actualAnim === desiredAnimation && desiredAnimation.isStarted) {
                desiredAnimation.restart()
            }
        }

        if (this.actualAnim !== desiredAnimation) {
            this.transitionToAnimation(desiredAnimation, 0.25, true, animSpeed)
            this.actualAnim = desiredAnimation
        } else if (!desiredAnimation.isPlaying) {
            desiredAnimation.start(true, animSpeed, desiredAnimation.from, desiredAnimation.to)
            desiredAnimation.setWeightForAllAnimatables(1)
        }
    }

    private shouldAnimateIdle(): boolean {
        if (this.parent.isMyChar()) return true
        if (Settings.isDetalLevelLow()) return false

        const maxDistance = Settings.getIdleAnimationDistance()
        const dx = this.parent.pos.x - MyPlayer.myChar.pos.x
        const dz = this.parent.pos.z - MyPlayer.myChar.pos.z
        return (dx * dx) + (dz * dz) <= maxDistance * maxDistance
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
        this.footStepSounds.forEach((sound) => {
            if (sound != except && sound.isPlaying) {
                sound.stop()
            }
        })
    }

    getStepSoundParams(): { speed: number; volume: number } {
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
        if (!targetAnim || this.actualAnim === targetAnim) return

        if (targetAnim !== this.idleAnim && targetAnim !== this.combatIdleAnim) {
            this.idleAnimationFrozen = false
        }

        // If there is already an ongoing transition
        if (this.animTransition) {
            // Force end the transition if the target animation is different
            if (this.animTransition.toAnimation !== targetAnim) {
                this.animTransition.forceEnd()
            } else {
                return
            }
        }
        const returningFromAction = (targetAnim === this.idleAnim || targetAnim === this.combatIdleAnim)
            && this.actualAnim != null && !this.actualAnim.loopAnimation
        if (returningFromAction) {
            // Temporary comparison: switch directly to the standing pose without blending.
            this.animTransition = null
            this.actualAnim?.stop()
            targetAnim.start(loop, speed, targetAnim.from, targetAnim.to)
            targetAnim.setWeightForAllAnimatables(1)
            return
        }
        this.animTransition = new AnimTransition(duration, this.actualAnim, targetAnim, loop, speed)
    }

    /**
     * Approximate model to the player position
     */
    moveModel(timeRate: number) {
        const approximationSpeed = this.parent.isPushThroughVisualActive() ? 15 : this.parent == MyPlayer.myChar ? 12 : 8
        const positionBlend = Math.min(1, approximationSpeed * timeRate)
        const heightBlend = Math.min(1, this.parent.yMoveSpeed * timeRate)
        this.node.position.x += (this.parent.pos.x - this.node.position.x) * positionBlend
        this.node.position.z += (this.parent.pos.z - this.node.position.z) * positionBlend
        this.node.position.y += (this.parent.logicYpos - this.node.position.y) * heightBlend
        this.parent.pos.y = this.node.position.y

        this.node.markAsDirty('position')
        this.node.computeWorldMatrix(true)

        if (this.model) {
            this.model.computeWorldMatrix(true)
        }
    }

    snapToParentPosition() {
        if (!this.initialized || !this.model) {
            return
        }
        this.node.position.x = this.parent.pos.x
        this.node.position.y = this.parent.logicYpos
        this.node.position.z = this.parent.pos.z
        this.node.markAsDirty('position')
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

        const delta = Math.atan2(Math.sin(lookAngle - current), Math.cos(lookAngle - current))

        if (Math.abs(delta) <= rotationSpeed) {
            current += delta
        } else {
            current += Math.sign(delta) * rotationSpeed
        }
        model.rotation.y = current + this.modelYAngleOffset
        this.modelRotation = model.rotation.y
    }

    setWeaponTrailEnabled(enabled: boolean, powerStrike: boolean = false) {
        if (enabled && !Settings.isCombatEffectEnabled(this.parent === MyPlayer.myChar || this.parent.autoAttackTarget === MyPlayer.myChar)) {
            return
        }
        this.weaponEquipItem?.setWeaponTrailEnabled(enabled, powerStrike)
    }

    stopWeaponTrailImmediately() {
        this.weaponEquipItem?.stopWeaponTrailImmediately()
    }

    disposeWeaponTrail() {
        this.weaponEquipItem?.disposeWeaponTrail()
    }

    getOwnerId(): number {
        return this.parent.id
    }

    getEquipmentDebugLabel(): string {
        return `Steve / ${this.parent.name} / ID ${this.parent.id}`
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
        this.viewRequested = true
        if (!this.initialized) await this.initAsync()
        if (!this.viewRequested || this.node.isDisposed()) {
            this.removeFromView()
            return
        }
        this.snapToParentPosition()
        if (this.parent.dead) this.playDeathAnimation()
        this.setAnimationsPaused(false)
        this.model!.setEnabled(true)
        ActiveMeshFreezer.setSkeletonActive(this.skeleton, true)
        this.equipSet.forEach((item) => {
            EquipManager.addEquippedItem(item)
            if (item.hasSwordParticles) {
                item.createSwordParticles(this.rhandNode)
            }
        })
        this.parent.nameDisplayTime = Date.now() + 3000
    }

    removeFromView() {
        this.viewRequested = false
        if (this.initialized) {
            ActiveMeshFreezer.setSkeletonActive(this.skeleton, false)
            this.setAnimationsPaused(true)
            this.model!.setEnabled(false)
        }
        this.equipSet.forEach((item) => {
            EquipManager.removeEquippedItem(item)
        })
    }

    private setAnimationsPaused(paused: boolean) {
        if (!paused && this.idleAnimationFrozen) return

        const animations = new Set<AnimationGroup>()
        if (this.actualAnim) animations.add(this.actualAnim)
        if (this.animTransition?.fromAnimation) animations.add(this.animTransition.fromAnimation)
        if (this.animTransition?.toAnimation) animations.add(this.animTransition.toAnimation)

        animations.forEach((animation) => {
            if (paused) {
                if (animation.isPlaying) animation.pause()
            } else if (animation.isStarted && !animation.isPlaying) {
                animation.restart()
            }
        })
    }

    removeFromScene() {
        if (this.node.isDisposed()) return
        this.viewRequested = false
        this.stopAllStepSounds()
        this.footStepSounds.forEach(sound => sound.dispose())
        this.footStepSounds.clear()
        this.actualStepSound = null
        this.removeFromView()
        this.model?.getChildMeshes().forEach((mesh) => {
            Lights.unregisterActorLightMesh(mesh)
            Lights.removeShadowCaster(mesh, true, false, true)
        })
        this.equipSet.forEach(item => item.disposeWeaponTrail())
        if (this.bowAimEndObserver) {
            this.bowAimAnim?.onAnimationEndObservable.remove(this.bowAimEndObserver)
            this.bowAimEndObserver = null
        }
        if (this.instantiatedEntries) {
            CharacterModel.release(this.node.getScene(), this.instantiatedEntries)
        }
        this.instantiatedEntries = null
        this.equipSet.clear()
        this.weaponEquipItem = null
        this.animTransition = null
        this.actualAnim = undefined
        this.initialized = false
        this.nameTextNode.dispose()
        this.lhandNode.dispose()
        this.rhandNode.dispose()
        this.node.dispose()
    }
}
