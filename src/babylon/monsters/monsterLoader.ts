import { Mesh, Scene, SceneLoader, Vector3 } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { Settings } from '@/settings/settings'
import { MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { MonsterTemplate, MonsterTemplates } from '@/babylon/monsters/codebook/monsterTemplates'

export const MonsterLoader = {
    scene: null as Scene,
    monstersMeshes: [] as Mesh[],
    monsterTemplates: new Map<number, MonsterTemplate>(),

    async initialize (scene: Scene) {
        this.scene = scene

        for (const key in MonsterTemplates) {
            await this.loadMonsterMesh(MonsterTemplates[key])
        }
    },

    async loadMonsterMesh (mobType: MonsterTemplate) {
        // Load asset container (used for cloning)
        const result = await SceneLoader.LoadAssetContainerAsync(
            "",
            "/models/monsters/" + mobType.meshName, this.scene!
        )

        const model = result.meshes[0];
        model.scaling = mobType.scale;
        model.rotation = Vector3.Zero()
        model.alwaysSelectAsActiveMesh = true

        const material = Materials.getPBRMaterial(this.scene!, mobType.getMaterialName(), "/models/monsters/" + mobType.textureName, true, false, {
            metallic: 0,
            roughness: 1,
            directIntensity: 1,
            environmentIntensity: 1,
        })
        model.getChildMeshes().forEach(mesh => {
            mesh.material = material;
            mesh.alwaysSelectAsActiveMesh = true
            if (Settings.shadows) {
                 mesh.receiveShadows = true;
            }
        });

        // Set asset container to monsterTemplate
        mobType.setAssetContainer(result)
        this.monsterTemplates.set(mobType.id, mobType)
    },

    getMonsterClone (mobType: MonsterType): MonsterTemplate {
        const template = this.monsterTemplates.get(mobType.templateId)!.clone()
        return template
    },
}


