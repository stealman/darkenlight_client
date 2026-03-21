import { AnimationGroup, AssetContainer, Mesh, Skeleton, Vector3 } from '@babylonjs/core'
import { BabylonUtils } from '@/babylon/utils'
import { Monster } from '@/babylon/monsters/monster'
import { Lights } from '@/babylon/scene/lights'

export class MonsterTemplate {
    id: number
    meshName: string
    textureName: string
    scale: Vector3
    clonesAct: Array<MonsterTemplate> = []
    clonesInact: Array<MonsterTemplate> = []
    clonesToReuse: Array<MonsterTemplate> = []

    // Original GLTF data used as source of clones
    assetContainer?: AssetContainer

    node: Mesh
    mesh: Mesh
    skeleton: Skeleton
    animation: AnimationGroup
    monster: Monster | null = null

    constructor(id: number, meshName: string, textureName: string, scale: Vector3 | number) {
        this.id = id
        this.meshName = meshName
        this.textureName = textureName
        this.scale = typeof scale === 'number' ? BabylonUtils.getSymVector(scale) : scale
    }

    setAssetContainer (assetContainer: AssetContainer) {
        this.assetContainer = assetContainer
        this.assetContainer.animationGroups[0].pause()
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
        clone.node.alwaysSelectAsActiveMesh = true

        clone.node.getChildMeshes().forEach(mesh => {
            clone.mesh = mesh as Mesh
            clone.mesh.alwaysSelectAsActiveMesh = true
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
        this.clonesToReuse.push(clone)
        this.clonesAct = this.clonesAct.filter(c => c !== clone)
        this.clonesInact = this.clonesInact.filter(c => c !== clone)
    }

    getMaterialName (): string {
        return "mob_template_" + this.textureName
    }
}

export const MonsterTemplates = {
    CAT : new MonsterTemplate(4, "cat.gltf", "cat.png", 0.85),
    SKELETON: new MonsterTemplate(1,  "skeleton.gltf", "skeleton.png",  0.35),
    WITHER: new MonsterTemplate(2,  "skeleton.gltf", "wither.png",  0.35),
    ZOMBIE: new MonsterTemplate(3,  "human_male.gltf", "zombie.png",  0.25),
}
