import { AnimationGroup, AssetContainer, Material, Mesh, Skeleton, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { Monster } from '@/babylon/monsters/monster'
import { Lights } from '@/babylon/scene/lights'
import { Settings } from '@/settings/settings'

export class MonsterTemplate {
    static readonly MODEL_EXTENSION = '.gltf'
    static readonly TEXTURE_EXTENSION = '.png'
    static readonly MAX_REUSABLE_CLONES = 3

    id: number
    meshName: string
    textureName: string
    emissiveTextureName: string | null
    scale: Vector3
    clonesAct: Array<MonsterTemplate> = []
    clonesInact: Array<MonsterTemplate> = []
    clonesToReuse: Array<MonsterTemplate> = []

    // Original GLTF data used as source of clones
    assetContainer?: AssetContainer
    material?: Material

    node: Mesh
    mesh: Mesh
    skeleton: Skeleton
    animation: AnimationGroup
    monster: Monster | null = null

    constructor(id: number, meshName: string, textureName: string, scale: Vector3 | number, emissiveTextureName: string | null) {
        this.id = id
        this.meshName = MonsterTemplate.withExtension(meshName, MonsterTemplate.MODEL_EXTENSION)
        this.textureName = MonsterTemplate.withExtension(textureName, MonsterTemplate.TEXTURE_EXTENSION)
        this.emissiveTextureName = emissiveTextureName ? MonsterTemplate.withExtension(emissiveTextureName, MonsterTemplate.TEXTURE_EXTENSION) : null
        this.scale = typeof scale === 'number' ? BabylonUtils.getSymVector(scale) : scale
    }

    static withExtension(name: string, extension: string): string {
        return name.endsWith(extension) ? name : `${name}${extension}`
    }

    setAssetContainer (assetContainer: AssetContainer) {
        this.assetContainer = assetContainer
        this.assetContainer.animationGroups[0].pause()
    }

    setMaterial (material: Material) {
        this.material = material
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

        const clone = new MonsterTemplate(this.id, this.meshName, this.textureName, this.scale)
        clone.node = entries.rootNodes[0] as Mesh
        clone.node.scaling.copyFrom(this.scale)
        clone.node.rotation = Vector3.Zero()
        clone.node.alwaysSelectAsActiveMesh = true
        clone.material = this.material

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
        Lights.addShadowCaster(clone.mesh)
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
        this.clonesToReuse.push(clone)
        this.clonesAct = this.clonesAct.filter(c => c !== clone)
        this.clonesInact = this.clonesInact.filter(c => c !== clone)

        if (this.clonesToReuse.length > MonsterTemplate.MAX_REUSABLE_CLONES) {
            const disposableClone = this.clonesToReuse.shift()!
            Lights.removeShadowCaster(disposableClone.mesh)
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
    CAT : new MonsterTemplate(1001, "cat", "cat", 0.85, null),
    SKELETON: new MonsterTemplate(1,  "skeleton", "skeleton",  0.35, null),
    WITHER: new MonsterTemplate(21,  "skeleton", "wither",  0.35, null),
    ZOMBIE_ROTTEN: new MonsterTemplate(11,  "human_male", "zombie_rotten",  new Vector3(0.225, 0.25, 0.225), null),
    ZOMBIE: new MonsterTemplate(12,  "human_male", "zombie",  0.25, null),
    ZOMBIE_MUTANT: new MonsterTemplate(13,  "human_male", "zombie_mutant",  0.275, "zombie_mutant_em"),
}
