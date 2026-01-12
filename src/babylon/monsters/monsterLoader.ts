import { Mesh, SceneLoader, Vector3 } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { Settings } from '@/settings/settings'
import { MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { MonsterTemplate, MonsterTemplates } from '@/babylon/monsters/codebook/monsterTemplates'
import { Renderer } from '@/babylon/scene/renderer'

export const MonsterLoader = {
    monstersMeshes: [] as Mesh[],
    monsterTemplates: new Map<number, MonsterTemplate>(),

    async initialize () {
        this.monstersMeshes = []
        for (const key in MonsterTemplates) {
            console.log("Loading monster mesh: " + key)
            await this.loadMonsterMesh(MonsterTemplates[key])
        }
    },

    async loadMonsterMesh (mobType: MonsterTemplate) {
        // Load asset container (used for cloning)
        const result = await SceneLoader.LoadAssetContainerAsync(
            "",
            "/models/monsters/" + mobType.meshName, Renderer.scene
        )

        const model = result.meshes[0];
        model.scaling = mobType.scale;
        model.rotation = Vector3.Zero()
        model.alwaysSelectAsActiveMesh = true

        const material = Materials.getPBRMaterial(Renderer.scene, mobType.getMaterialName(), "/models/monsters/" + mobType.textureName, true, false, {
            metallic: 0,
            roughness: 1,
            directIntensity: 1,
            environmentIntensity: 1,
        })
        model.getChildMeshes().forEach(mesh => {
            mesh.material = material;
            mesh.alwaysSelectAsActiveMesh = true
            if (Settings.isShadowsEnabled) {
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


