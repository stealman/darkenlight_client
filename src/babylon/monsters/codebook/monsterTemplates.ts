import { AnimationGroup, AssetContainer, Mesh, PBRMaterial, Skeleton, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { Monster } from '@/babylon/monsters/monster'
import { Lights } from '@/babylon/scene/lights'
import { Settings } from '@/settings/settings'
import { MonsterPersistentEffectType, MonsterPersistentEffectTypes } from '@/babylon/gfx/monsterPersistentEffectTypes'

export class MonsterTemplate {
    static readonly MODEL_EXTENSION = '.gltf'
    static readonly TEXTURE_EXTENSION = '.png'
    static readonly MAX_REUSABLE_CLONES = 3
    static readonly DEFAULT_SELECTED_EMISSIVE_STRENGTH = 0.1

    id: number
    meshName: string
    textureName: string
    emissiveTextureName: string | null
    environmentIntensity: number
    selectedEmissiveStrength: number
    persistentEffectType: MonsterPersistentEffectType | null
    scale: Vector3
    clonesAct: Array<MonsterTemplate> = []
    clonesInact: Array<MonsterTemplate> = []
    clonesToReuse: Array<MonsterTemplate> = []

    // Original GLTF data used as source of clones
    assetContainer?: AssetContainer
    material?: PBRMaterial
    selectedMaterial?: PBRMaterial

    node: Mesh
    mesh: Mesh
    skeleton: Skeleton
    animation: AnimationGroup
    monster: Monster | null = null

    constructor(id: number, meshName: string, textureName: string, scale: Vector3 | number, emissiveTextureName: string | null, environmentIntensity: number = 1, selectedEmissiveStrength: number = MonsterTemplate.DEFAULT_SELECTED_EMISSIVE_STRENGTH, persistentEffectType: MonsterPersistentEffectType | null = null) {
        this.id = id
        this.meshName = MonsterTemplate.withExtension(meshName, MonsterTemplate.MODEL_EXTENSION)
        this.textureName = MonsterTemplate.withExtension(textureName, MonsterTemplate.TEXTURE_EXTENSION)
        this.emissiveTextureName = emissiveTextureName ? MonsterTemplate.withExtension(emissiveTextureName, MonsterTemplate.TEXTURE_EXTENSION) : null
        this.environmentIntensity = environmentIntensity
        this.selectedEmissiveStrength = selectedEmissiveStrength
        this.persistentEffectType = persistentEffectType
        this.scale = typeof scale === 'number' ? BabylonUtils.getSymVector(scale) : scale
    }

    static withExtension(name: string, extension: string): string {
        return name.endsWith(extension) ? name : `${name}${extension}`
    }

    setAssetContainer (assetContainer: AssetContainer) {
        // Clones belong to the previous Babylon scene after logout. Never
        // reuse them when the renderer has created a fresh scene on login.
        this.clonesAct = []
        this.clonesInact = []
        this.clonesToReuse = []
        this.assetContainer = assetContainer
        this.assetContainer.animationGroups[0].pause()
    }

    setMaterials (material: PBRMaterial, selectedMaterial: PBRMaterial) {
        this.material = material
        this.selectedMaterial = selectedMaterial
    }

    clone (): MonsterTemplate {
        if (this.clonesToReuse.length > 0) {
            const clone = this.clonesToReuse.pop()!
            clone.animation.reset()
            this.activateClone(clone)
            return clone
        }
        const entries = this.assetContainer!.instantiateModelsToScene(undefined, false, {
            doNotInstantiate: true,
        })

        const clone = new MonsterTemplate(this.id, this.meshName, this.textureName, this.scale, this.emissiveTextureName, this.environmentIntensity, this.selectedEmissiveStrength, this.persistentEffectType)
        clone.node = entries.rootNodes[0] as Mesh
        clone.node.scaling.copyFrom(this.scale)
        clone.node.rotation = Vector3.Zero()
        clone.node.alwaysSelectAsActiveMesh = true
        clone.material = this.material
        clone.selectedMaterial = this.selectedMaterial

        clone.node.getChildMeshes().forEach(mesh => {
            clone.mesh = mesh as Mesh
            clone.mesh.alwaysSelectAsActiveMesh = true
            clone.mesh.material = this.material ?? null
            if (Settings.isShadowsEnabled()) {
                clone.mesh.receiveShadows = true
            }
        })

        clone.skeleton = entries.skeletons[0]
        clone.mesh!.skeleton = entries.skeletons[0]
            clone.mesh!.isPickable = true

        clone.animation = entries.animationGroups[0]

        this.clonesAct.push(clone)
        Lights.addShadowCaster(clone.mesh, true, false, true)
        Lights.registerActorLightMesh(clone.mesh)
        return clone
    }

    deactivateClone (clone: MonsterTemplate) {
        this.clonesAct = this.clonesAct.filter(c => c !== clone)
        this.clonesInact.push(clone)

        clone.monster = null
        clone.node.setEnabled(false)
        clone.mesh.setEnabled(false)
    }

    activateClone (clone: MonsterTemplate) {
        this.clonesInact = this.clonesInact.filter(c => c !== clone)
        this.clonesAct.push(clone)

        clone.node.setEnabled(true)
        clone.mesh.alwaysSelectAsActiveMesh = true
        clone.mesh.setEnabled(true)
    }

    freeClone (clone: MonsterTemplate) {
        clone.monster = null
        clone.node.getChildMeshes().forEach(mesh => {
            mesh.material = clone.material ?? null
        })
        this.clonesToReuse.push(clone)
        this.clonesAct = this.clonesAct.filter(c => c !== clone)
        this.clonesInact = this.clonesInact.filter(c => c !== clone)

        if (this.clonesToReuse.length > MonsterTemplate.MAX_REUSABLE_CLONES) {
            const disposableClone = this.clonesToReuse.shift()!
            Lights.removeShadowCaster(disposableClone.mesh, true, false, true)
            Lights.unregisterActorLightMesh(disposableClone.mesh)
            disposableClone.animation.stop()
            disposableClone.animation.dispose()
            disposableClone.skeleton.dispose()
            disposableClone.node.dispose(false, false)
        }
    }

    getMaterialName (): string {
        return "mob_template_" + this.textureName
    }
}

export const MonsterTemplates = {
    CAT: new MonsterTemplate(1001, 'cat', 'cat', 0.85, null),
    SKELETON: new MonsterTemplate(1, 'skeleton', 'skeleton', 0.4, null),
    WITHER: new MonsterTemplate(21, 'skeleton', 'wither', 0.4, null),
    ZOMBIE_ROTTEN: new MonsterTemplate(11, 'zombie', 'zombie_rotten', 0.42, null, 1.4),
    ZOMBIE: new MonsterTemplate(12, 'zombie', 'zombie', 0.43, null, 1.4),
    ZOMBIE_MUTANT: new MonsterTemplate(13, 'zombie', 'zombie_mutant', 0.48, null, 1.4),
    WIGHT: new MonsterTemplate(31, 'wraith', 'wight', 0.6, 'wight_em'),
    // WRAITH: new MonsterTemplate(32, 'wraith', 'wraith', 0.6, 'wraith_em', 1, MonsterTemplate.DEFAULT_SELECTED_EMISSIVE_STRENGTH, MonsterPersistentEffectTypes.SPECTRAL_AURA),
    WRAITH: new MonsterTemplate(32, 'wraith', 'wraith', 0.6, 'wraith_em'),
    WRAITH_LORD: new MonsterTemplate(33, 'wraith', 'wraith_lord', 0.6, 'wraith_lord_em', 1, MonsterTemplate.DEFAULT_SELECTED_EMISSIVE_STRENGTH, MonsterPersistentEffectTypes.WRAITH_LORD_DOWNWARD_SMOKE),
}
