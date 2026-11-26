import {
    AbstractMesh, AssetContainer,
    AnimationGroup, Matrix, Mesh, Quaternion, TargetedAnimation,
    InstantiatedEntries, Observer, Scene, SceneLoader, Skeleton, Sound, TransformNode,
    Vector3,
} from '@babylonjs/core'
import { AudioManager, FootStepSpeeds, FootStepTypes } from '@/babylon/audio/audioManager'
import { AnimTransition } from '@/babylon/animations/animation'
import { Lights } from '@/babylon/scene/lights'
import type Character from '@/babylon/character/character'
import { MyPlayer } from '@/data/myPlayer'
import { WorldDataManager } from '@/data/worldDataManager'
import { EquipBearer, EquipItem, EquipManager } from '@/babylon/item/equipManager'
import { BabylonUtils } from '@/babylon/utils'
import { EquipItemSlots, EquipSlotModelsCb, WeaponCategories, WeaponTypes } from '@/data/items/item'
import { Utils } from '@/utils/utils'
import { AudioUtils } from '@/babylon/audio/audioUtils'
import { getCharacterModelEquipModifier } from '@/babylon/character/characterModelEquipModifiers'
import { Settings } from '@/settings/settings'
import { ActiveMeshFreezer } from '@/babylon/scene/activeMeshFreezer'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import type { CharacterGender } from './characterAppearance'
import { HUMAN_MODEL_FILE, HUMAN_ANIMATION_SPEED, WAND_RELEASE_FRAME, getHumanAnimationRange, prepareHumanSkeleton } from './humanModelRig'
import { MagicArrow } from '@game/game/spells/magicArrow'
import { applyCharacterEquipmentFitting, getCharacterEquipmentSources, getCharacterHairFitting, preloadCharacterEquipmentFitting } from './characterEquipmentFitting'
import { isLeatherArmorModelId } from '@game/character/items/codebook/armorsCodebook'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { WorldRenderer } from '@/babylon/world/worldRenderer'
import type { StaticObject } from '@/babylon/world/statics/objects/baseStaticObject'
import { CharacterActions } from '@/data/actions/characterActions'
import { characterHeadMatrix, getCharacterHeadType, loadCharacterHead } from './characterHead'
import { getCharacterBodyMaterial } from './characterMaterial'
import { attachCharacterHair, CHARACTER_HAIR_TYPES, FEMALE_CHARACTER_HAIR_TYPES, isHairHiddenByHeadgear, hideCharacterHair, loadCharacterHair, setCharacterHairColorId } from './characterHair'

interface CharacterModelAppearance {
    renderHelmet?: boolean
}

export class CharacterModel implements EquipBearer {
    private static readonly preparedModelCount = 6
    private static readonly maxReusableModels = 8
    private static containerPromises = new WeakMap<Scene, Map<CharacterGender, Promise<AssetContainer>>>()
    private static preparedModels = new WeakMap<Scene, Map<CharacterGender, InstantiatedEntries[]>>()
    private static preparedAnimations = new WeakMap<InstantiatedEntries, AnimationGroup[]>()

    private readonly gender: CharacterGender
    private readonly bodyGender: CharacterGender
    private readonly renderHelmet: boolean
    parent: Character
    node: TransformNode = new TransformNode('characterModelNode')
    nameTextNode: TransformNode
    initialized: boolean = false
    viewRequested: boolean = false
    hairEquipmentRefreshEnabled = true

    model: AbstractMesh | undefined
    private instantiatedEntries: InstantiatedEntries | null = null
    private initializationPromise: Promise<void> | null = null
    private hairAppearanceRevision = 0
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
    sittingIdleAnim: AnimationGroup | undefined
    private spellCastingWandAnim: AnimationGroup | undefined
    private spellReleaseWandAnim: AnimationGroup | undefined
    private cachedBench: StaticObject | null = null
    private benchCheckFrame = -Infinity
    combatIdleAnim: AnimationGroup | undefined
    combatIdleTwoHandedAnim: AnimationGroup | undefined
    slashAnim: AnimationGroup | undefined
    slashAnim2: AnimationGroup | undefined
    jabAnim: AnimationGroup | undefined
    leftSlashAnim: AnimationGroup | undefined
    rightSlashAnim: AnimationGroup | undefined
    highJabAnim: AnimationGroup | undefined

    greatAxeAttackAnim: AnimationGroup | undefined
    twoHandedSwordAttackAnim: AnimationGroup | undefined
    twoHandedSwordAttackAnim2: AnimationGroup | undefined

    bowAimAnim: AnimationGroup | undefined

    oreMiningAnim: AnimationGroup | undefined
    deathAnim: AnimationGroup | undefined
    pickupAnim: AnimationGroup | undefined

    actualAnim: AnimationGroup | undefined
    animTransition: AnimTransition | null = null
    idleAnimationFrozen: boolean = false
    deathSink: number = 0
    deathSinkTarget: number = 0

    equipSet: Map<string, EquipItem> = new Map()
    weaponEquipItem: EquipItem | null = null

    actualStepSound: Sound | null = null
    footStepSounds: Map<string, Sound> = new Map()

    constructor(parent: Character, appearance: CharacterModelAppearance = {}, private readonly uniformAppearance = true) {
        this.parent = parent
        this.bodyGender = parent.gender === 'F' ? 'F' : 'M'
        this.gender = this.uniformAppearance ? 'M' : this.bodyGender
        this.renderHelmet = appearance.renderHelmet ?? parent.rendersHelmet ?? false
        this.node.position.copyFrom(this.parent.pos)
        this.nameTextNode = new TransformNode('nameTextNode' + this.parent.id)
    }

    static async create(data: Character, init: boolean, entries?: InstantiatedEntries, appearance?: CharacterModelAppearance): Promise<CharacterModel> {
        // FPS comparison: keep equipment fitting fixed.
        const model = new CharacterModel(data, appearance, !entries)
        if (entries) model.instantiatedEntries = entries
        if (init) await model.initAsync()
        return model
    }

    private static getPool(scene: Scene, gender: CharacterGender): InstantiatedEntries[] {
        let pools = this.preparedModels.get(scene)
        if (!pools) { pools = new Map(); this.preparedModels.set(scene, pools) }
        let pool = pools.get(gender)
        if (!pool) { pool = []; pools.set(gender, pool) }
        return pool
    }

    static async preload(scene: Scene) {
        await Promise.all([
            ...(['M', 'F'] as const).map(async gender => {
                const container = await this.getContainer(scene, gender)
                const pool = this.getPool(scene, gender)
                const material = getCharacterBodyMaterial(scene, gender)
                while (pool.length < this.preparedModelCount) {
                    const entries = container.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
                    const body = entries.rootNodes[0] as AbstractMesh
                    this.configureBodyTransform(body)
                    body.setEnabled(false)
                    for (const mesh of body.getChildMeshes()) {
                        mesh.material = material
                        mesh.receiveShadows = true
                    }
                    if (entries.animationGroups.length > 0) this.prepareAnimations(entries)
                    // Allocate the bone matrices and their GPU textures before
                    // several pooled bodies can become visible on one frame.
                    for (const skeleton of entries.skeletons) skeleton.prepare(true)
                    pool.push(entries)
                }
            }),
            this.loadAppearanceSources(scene),
        ])
    }

    private static loadAppearanceSources(scene: Scene) {
        return Promise.all([
            loadCharacterHead(scene), loadCharacterHead(scene, 1, 'F'),
            ...CHARACTER_HAIR_TYPES.map(({id}) => loadCharacterHair(scene, id)),
            ...FEMALE_CHARACTER_HAIR_TYPES.map(({id}) => loadCharacterHair(scene, id, 'F')),
        ])
    }

    static async warmUpAppearance(scene: Scene): Promise<void> {
        const sources = await this.loadAppearanceSources(scene)
        await EquipManager.warmUpShaders([...sources, ...getCharacterEquipmentSources(scene)])
        for (const gender of ['M', 'F'] as const) {
            for (const entries of this.getPool(scene, gender)) {
                for (const mesh of entries.rootNodes[0]?.getChildMeshes() ?? []) {
                    // Scene readiness also checks pooled meshes. Give them the
                    // runtime light layout before their first shader is built.
                    Lights.registerActorLightMesh(mesh)
                }
            }
        }
    }

    private static getContainer(scene: Scene, gender: CharacterGender): Promise<AssetContainer> {
        let containers = this.containerPromises.get(scene)
        if (!containers) { containers = new Map(); this.containerPromises.set(scene, containers) }
        let promise = containers.get(gender)
        if (!promise) {
            const file = gender === 'F' ? 'human_female.glb' : HUMAN_MODEL_FILE
            promise = Promise.all([
                SceneLoader.LoadAssetContainerAsync('', modelAssetUrl('/models/human/' + file), scene),
                preloadCharacterEquipmentFitting(scene, gender),
            ]).then(([container]) => container)
            containers.set(gender, promise)
        }
        return promise
    }

    private static configureBodyTransform(body: AbstractMesh) {
        // Use the runtime scale in the pool too so Babylon prepares the
        // same normal transformation in the body shader before activation.
        // The negative Z scale preserves glTF handedness.
        body.scaling = new Vector3(0.3, 0.28, -0.3)
        body.rotation = Vector3.Zero()
    }

    private static prepareAnimations(entries: InstantiatedEntries): AnimationGroup[] {
        const existing = this.preparedAnimations.get(entries)
        if (existing) return existing
        const source = entries.animationGroups[0]
        // Unauthored actions keep separate groups but temporarily sample JAB.
        const animations = [
            'Idle', 'Walk', 'Run', 'CombatIdle', 'Slash', 'Jab',
            'LeftSlash', 'RightSlash', 'HighJab', 'Slash2', 'BowAim',
            'GreatAxeAttack', 'OreMining', 'Death', 'TwoHandedSwordAttack',
            'TwoHandedSwordAttack2', 'CombatIdleTwoHanded', 'Pickup', 'SittingIdle',
            'SPELL_CASTING_WAND_1', 'SPELL_RELEASE_WAND_1',
        ].map(name => ({ name, ...getHumanAnimationRange(name) }))

        const groups = animations.map(({name, startFrame, endFrame}) => {
            const group = source.clone(name)
            group.from = startFrame
            group.to = endFrame
            return group
        })
        entries.animationGroups.push(...groups)
        this.preparedAnimations.set(entries, groups)
        return groups
    }

    private static async instantiate(scene: Scene, gender: CharacterGender): Promise<InstantiatedEntries> {
        const container = await this.getContainer(scene, gender)
        const entries = this.getPool(scene, gender).pop()
            ?? container.instantiateModelsToScene(undefined, false, {doNotInstantiate: true})
        entries.rootNodes[0]?.setEnabled(true)
        return entries
    }

    private static release(scene: Scene, entries: InstantiatedEntries, gender: CharacterGender) {
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
        const pool = this.getPool(scene, gender)
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

    private isHairHidden(headModelId?: number): boolean {
        return this.renderHelmet && headModelId != null
            && (this.parent.hidesHairUnderHelmet || isHairHiddenByHeadgear(headModelId, this.bodyGender))
    }

    private async initializeModelAsync() {
        const scene = this.node.getScene()
        const hairHidden = this.isHairHidden(this.parent.equipSet.get(EquipItemSlots.HEAD)?.modelId)
        const hairTypeId = this.parent.hairTypeId
        // The shared AssetContainer parses the GLB once. Most nearby human
        // models are instantiated behind the loading overlay and only enabled
        // when their character first enters the viewport.
        await Promise.all([
            this.instantiatedEntries ? Promise.resolve(this.instantiatedEntries) : CharacterModel.instantiate(scene, this.bodyGender),
            loadCharacterHead(scene, this.parent.headTypeId, this.bodyGender),
            hairHidden ? Promise.resolve(null) : loadCharacterHair(scene, hairTypeId, this.bodyGender),
        ])
            .then(([result, headType, hairType]) => {
                if (this.node.isDisposed()) {
                    CharacterModel.release(scene, result, this.bodyGender)
                    return
                }
                this.instantiatedEntries = result
                this.model = result.rootNodes[0] as AbstractMesh
                this.model.parent = this.node
                CharacterModel.configureBodyTransform(this.model)

                this.nameTextNode.parent = this.node
                this.nameTextNode.position.y = this.parent.getModelHeight()
                this.parent.nameDisplayTime = Date.now() + 3000

                // Apply material
                const material = getCharacterBodyMaterial(scene, this.bodyGender)
                this.model.getChildMeshes().forEach((mesh) => {
                    // Visibility is managed by Character.setVisible(). A moving
                    // body excluded by frustum culling when the active list is
                    // frozen would stay missing until the next invalidation.
                    mesh.alwaysSelectAsActiveMesh = true
                    mesh.material = material
                    mesh.receiveShadows = true
                    Lights.addShadowCaster(mesh, true, false, true)
                    Lights.registerActorLightMesh(mesh)
                })

                // Process animations
                if (result.animationGroups.length > 0) {
                    const animationGroup = result.animationGroups[0] // Assuming there is one animation group
                    animationGroup.stop()

                    const newAnimationGroups = CharacterModel.prepareAnimations(result)

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
                    this.combatIdleTwoHandedAnim = newAnimationGroups[16]
                    this.pickupAnim = newAnimationGroups[17]
                    this.sittingIdleAnim = newAnimationGroups[18]
                    this.spellCastingWandAnim = newAnimationGroups[19]
                    this.spellReleaseWandAnim = newAnimationGroups[20]

                    this.idleAnim?.start(true, HUMAN_ANIMATION_SPEED.idle)
                    this.actualAnim = this.idleAnim
                }
                this.skeleton = result.skeletons[0]
                prepareHumanSkeleton(this.skeleton)
                this.lhandNode.attachToBone(this.skeleton.bones.find((b) => b.id === 'Bone.012')!, this.model) // Lhand 012
                this.rhandNode.attachToBone(this.skeleton.bones.find((b) => b.id === 'Bone.009')!, this.model) // Rhand 009
                if (headType) {
                    const head = new EquipItem(headType, 0, this, this.skeleton.bones.find(b => b.id === 'Bone.002')!, null, null, null)
                    head.attachUsingFullBoneTransform(characterHeadMatrix(getCharacterHeadType(this.parent.headTypeId, this.bodyGender).fitting))
                    head.castsOutdoorShadow = this.parent.isMyChar()
                    this.equipSet.set('FACE', head)
                    EquipManager.addEquippedItem(head)
                }
                if (hairType) attachCharacterHair(this, hairType, getCharacterHairFitting(scene, hairTypeId ?? 1, this.bodyGender),
                    this.parent.hairColorId)
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
        await this.refreshHairAppearance()
        this.snapToParentPosition()
        if (this.parent.insideView) {
            ActiveMeshFreezer.setSkeletonActive(this.skeleton, true)
        }
    }

    async refreshHairAppearance() {
        if (!this.initialized || this.node.isDisposed()) return
        const revision = ++this.hairAppearanceRevision
        if (this.isHairHidden(this.equipSet.get('HEAD')?.type.id)) {
            hideCharacterHair(this)
            return
        }
        const typeId = this.parent.hairTypeId
        const type = await loadCharacterHair(this.node.getScene(), typeId, this.bodyGender)
        if (this.node.isDisposed() || revision !== this.hairAppearanceRevision || this.parent.hairTypeId !== typeId) return
        const current = this.equipSet.get('HAIR')
        if (current?.type === type) {
            setCharacterHairColorId(current, this.parent.hairColorId)
            return
        }
        const item = attachCharacterHair(this, type, getCharacterHairFitting(this.node.getScene(), typeId, this.bodyGender),
            this.parent.hairColorId)
        if (!this.parent.insideView) EquipManager.removeEquippedItem(item)
    }

    private requestHairRefresh() {
        if (!this.hairEquipmentRefreshEnabled) return
        void this.refreshHairAppearance().catch(error => console.error('Could not update character hair:', error))
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

        if (this.renderHelmet && this.parent.equipSet.get(EquipItemSlots.HEAD) && !this.equipSet.get('HEAD')) {
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
        this.equipSet.forEach((item, slot) => {
            if (slot === 'FACE' || slot === 'HAIR') return
            EquipManager.removeEquippedItem(item)
            item.disposeWeaponTrail()
            this.equipSet.delete(slot)
        })
        this.weaponEquipItem = null
        this.requestHairRefresh()
    }

    assignArmor(type: number, matIndex: number) {
        this.addEquippedItem('BODY', new EquipItem(EquipManager.getItemType(type)!, matIndex, this, this.skeleton!.bones.find((b) => b.id === 'Bone.001')!, null, null, null, getCharacterModelEquipModifier(type)))
    }

    assignHelmet(type: number, matIndex: number) {
        // Players and bots keep helmet stats without displaying the mesh.
        if (!this.renderHelmet) return
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
        const modelId = item.type.id
        const usesBodyFitting = isLeatherArmorModelId(modelId) || modelId === EquipSlotModelsCb.CRYSTALWAND.modelId
        const fittingGender = usesBodyFitting ? this.bodyGender : this.gender
        applyCharacterEquipmentFitting(this.node.getScene(), slot, item, fittingGender)
        item.castsOutdoorShadow = this.parent.isMyChar() && (slot === 'WEAPON' || slot === 'SHIELD')
        this.equipSet.set(slot, item)
        if (item.type.mesh || this.parent.insideView || this.viewRequested) EquipManager.addEquippedItem(item)
        if (slot === 'HEAD') this.requestHairRefresh()
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
                this.requestHairRefresh()
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
        if (this.parent.getLookAngle() != null || this.actualAnim === this.sittingIdleAnim) {
            this.resolveModelRotation(timeRate)
        }
        this.resolveModelHeight(timeRate)

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

            if (usesHeavyTwoHandedAnimations) {
                if (weapon.modelId !== EquipSlotModelsCb.HALBERD.modelId) {
                    possibleAnims.push(this.greatAxeAttackAnim)
                }
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
                    case WeaponTypes.WAND:
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
                        possibleAnims.push(this.rightSlashAnim)
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

        const attack = this.parent.autoAttackMessage
        const fillAttackInterval = attack && !attack.ps && !attack.prs
            && !this.parent.isWeaponRanged() && attack.cd > 0
        const clipDurationMs = (anim.to - anim.from) / anim.targetedAnimations[0].animation.framePerSecond * 1000
        // Let a normal melee swing occupy the full start-to-start interval.
        // Hit timing stays server-owned; ranged and special attacks retain their timing.
        const speed = fillAttackInterval ? clipDurationMs / attack.cd
            : baseAnimSpeed / this.parent.attackAnimationTime
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

    playPickupAnimation() {
        if (!this.isActive() || !this.pickupAnim || this.parent.dead || this.parent.healingActive) return
        const standingPose = this.actualAnim === this.idleAnim || this.actualAnim === this.combatIdleAnim
            || this.actualAnim === this.combatIdleTwoHandedAnim || this.actualAnim === this.sittingIdleAnim
        if (this.actualAnim?.isPlaying && !standingPose) return

        this.transitionToAnimation(this.pickupAnim, 0.05, false, 1)
        this.actualAnim = this.pickupAnim
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

    updateSpellStance(elapsedMs = 0, playbackSpeed = 1, castDuration: number = MagicArrow.castDuration) {
        if (!this.isActive()) return
        const charge = this.spellCastingWandAnim
        const swing = this.spellReleaseWandAnim
        const swingDuration = castDuration / 5
        const chargeDuration = castDuration - swingDuration
        const animation = (elapsedMs >= chargeDuration && swing ? swing : charge) ?? this.getCombatIdleAnimation()
        if (!animation || this.actualAnim === animation) return
        const swingPhase = animation === swing
        const spellMotion = animation === charge || swingPhase
        const speed = spellMotion
            ? 1000 * ((swingPhase ? WAND_RELEASE_FRAME : animation.to) - animation.from)
                / (animation.targetedAnimations[0].animation.framePerSecond * (swingPhase ? swingDuration : chargeDuration))
            : HUMAN_ANIMATION_SPEED.combatIdle
        this.transitionToAnimation(animation, (swingPhase ? 0.04 : 0.16) / playbackSpeed, !spellMotion, speed * playbackSpeed)
        this.actualAnim = animation
    }

    releaseSpellStance(playbackSpeed = 1, castDuration: number = MagicArrow.castDuration) {
        const swing = this.spellReleaseWandAnim
        if (!swing || !this.isActive() || (this.actualAnim !== swing && this.actualAnim !== this.spellCastingWandAnim)) return
        this.updateSpellStance(castDuration, playbackSpeed, castDuration)
        if (this.animTransition?.toAnimation === swing) {
            this.animTransition.forceEnd()
            this.animTransition = null
        }
        if (!swing.isStarted) swing.start(false, swing.speedRatio, WAND_RELEASE_FRAME, swing.to)
        swing.goToFrame(WAND_RELEASE_FRAME)
        swing.setWeightForAllAnimatables(1)
        if (this.weaponEquipItem?.type.id === EquipSlotModelsCb.CRYSTALWAND.modelId) {
            this.weaponEquipItem.updateAttachmentWorldMatrix()
        }
    }

    private isSpellMotion(animation?: AnimationGroup) {
        return animation != null && (animation === this.spellCastingWandAnim || animation === this.spellReleaseWandAnim)
    }

    finishSpellStance() {
        if (!this.isActive() || !this.isSpellMotion(this.actualAnim)) return
        const animation = this.getCombatIdleAnimation()
        if (!animation) return
        this.transitionToAnimation(animation, 0.18, true, HUMAN_ANIMATION_SPEED.combatIdle)
        this.actualAnim = animation
    }

    getSpellOriginToRef(feet: Vector3, result: Vector3) {
        const item = this.weaponEquipItem
        if (item?.type.id === EquipSlotModelsCb.CRYSTALWAND.modelId) {
            const shape = item.type.cbData
            shape.weaponTipPosition!.multiplyToRef(shape.scale, result)
            item.transformMeshPointToRef(result, result)
        } else {
            result.copyFrom(feet).addInPlaceFromFloats(0, 1.22, 0)
        }
    }

    private getCombatIdleAnimation(): AnimationGroup | undefined {
        const weapon = this.parent.getWeapon()
        const weaponType = weapon?.slotInfo?.weaponType
        const usesTwoHandedStance = weapon != null && (
            weaponType === WeaponTypes.TWO_HANDED_SWORD ||
            weaponType === WeaponTypes.TWO_HANDED_MACE ||
            weaponType === WeaponTypes.TWO_HANDED_POLEARM ||
            (weapon.isTwoHanded() && (
                weapon.weaponCategory === WeaponCategories.SWORD ||
                weapon.weaponCategory === WeaponCategories.AXE ||
                weapon.weaponCategory === WeaponCategories.MACE
            ) && weaponType !== WeaponTypes.PICKAXE)
        )
        return usesTwoHandedStance ? this.combatIdleTwoHandedAnim ?? this.combatIdleAnim : this.combatIdleAnim
    }

    private getBenchForSitting(): StaticObject | null {
        const frame = this.node.getScene().getFrameId()
        if (frame < this.benchCheckFrame || frame - this.benchCheckFrame >= 5) {
            this.cachedBench = StaticsManager.getBenchAtPosition(this.parent.pos.x, this.parent.pos.z)
            this.benchCheckFrame = frame
        }
        return this.cachedBench
    }

    private getIdleAnimation(): AnimationGroup | undefined {
        const action = this.parent === MyPlayer.myChar ? MyPlayer.activeAction?.name : null
        const animatedAction = action === CharacterActions.AUTO_ATTACK.name || action === CharacterActions.MINING.name
            || action === CharacterActions.LUMBERJACKING.name
        if (!this.sittingIdleAnim || this.parent.dead || animatedAction
            || this.parent.getMoveAngle() != null || this.parent.autoAttackEnd > Date.now()) return this.idleAnim

        return this.getBenchForSitting() ? this.sittingIdleAnim : this.idleAnim
    }

    stopAnimation() {
        // The server's action timer can end before the full authored clip.
        // Keep its existing playback tempo and finish it before returning to a standing pose.
        // Movement and a new attack can still interrupt it through their normal transitions.
        if (this.actualAnim?.isPlaying && !this.actualAnim.loopAnimation) return

        const inCombat = this.parent.isRecentlyInCombat()
        const desiredAnimation = inCombat ? this.getCombatIdleAnimation() : this.getIdleAnimation()
        const animSpeed = inCombat ? HUMAN_ANIMATION_SPEED.combatIdle : HUMAN_ANIMATION_SPEED.idle

        if (!desiredAnimation) return

        if (this.animTransition?.toAnimation === desiredAnimation && this.isSpellMotion(this.animTransition.fromAnimation)) return

        if (this.isSpellMotion(this.actualAnim)) {
            this.finishSpellStance()
            return
        }

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
            this.transitionToAnimation(desiredAnimation, desiredAnimation === this.sittingIdleAnim ? 0.4 : 0.25, true, animSpeed)
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
        this.resolveModelHeight(0)
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
        this.resolveModelHeight(0)
    }

    private resolveModelHeight(timeRate: number) {
        if (!this.model) return

        if (this.deathSink < this.deathSinkTarget) {
            this.deathSink = Math.min(this.deathSinkTarget, this.deathSink + timeRate * 0.4)
        }
        const x = Math.round(this.node.position.x)
        const z = Math.round(this.node.position.z)
        const map = MyPlayer.worldId ? WorldDataManager.worldDataMap.get(MyPlayer.worldId)?.blockMap : undefined
        const block = map?.[x]?.[z]
        const onSnow = map && block?.snowed && !block.shallowWater && !block.deepWater
            && !WorldRenderer.snowCoverMask.has(x * map.length + z)
            && !BuildingManager.getFloorHeightAtTile(x, z)
            && !StaticsManager.getWalkableHeightAtTile(x, z)
        const y = (onSnow ? -0.025 : 0) - this.deathSink
        if (this.model.position.y !== y) this.model.position.y = y
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

        const sittingTransition = targetAnim === this.sittingIdleAnim || this.actualAnim === this.sittingIdleAnim
        const standingPose = targetAnim === this.idleAnim || targetAnim === this.combatIdleAnim
            || targetAnim === this.combatIdleTwoHandedAnim || targetAnim === this.sittingIdleAnim
        if (!standingPose) {
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
        const smoothPoseReturn = sittingTransition
            || (standingPose && this.isSpellMotion(this.actualAnim))
            || (targetAnim === this.spellReleaseWandAnim && this.actualAnim === this.spellCastingWandAnim)
        const returningFromAction = standingPose
            && !smoothPoseReturn && this.actualAnim != null && !this.actualAnim.loopAnimation
        if (returningFromAction) {
            // Temporary comparison: switch directly to the standing pose without blending.
            this.animTransition = null
            this.actualAnim?.stop()
            targetAnim.start(loop, speed, targetAnim.from, targetAnim.to)
            targetAnim.setWeightForAllAnimatables(1)
            return
        }
        this.animTransition = new AnimTransition(duration, this.actualAnim, targetAnim, loop, speed, smoothPoseReturn)
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
        this.resolveModelHeight(0)
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
        let lookAngle = this.parent.getLookAngle()
        if (this.actualAnim === this.sittingIdleAnim && this.parent.getMoveAngle() == null) {
            const bench = this.getBenchForSitting()
            if (bench) {
                const axis = bench.getSizeX() >= bench.getSizeZ() ? Math.PI / 2 : 0
                const action = this.parent.activeTimedAction
                const reference = action?.x != null && action.z != null && lookAngle != null
                    ? lookAngle + this.modelYAngleOffset : model.rotation.y
                const delta = Math.atan2(Math.sin(axis - reference), Math.cos(axis - reference))
                const nearestDirection = Math.abs(delta) <= Math.PI / 2 ? axis : axis + Math.PI
                lookAngle = nearestDirection - this.modelYAngleOffset
            }
        }
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
            CharacterModel.release(this.node.getScene(), this.instantiatedEntries, this.bodyGender)
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
